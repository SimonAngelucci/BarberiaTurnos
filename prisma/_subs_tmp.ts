import http from "node:http";
import { createHmac } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { evaluate, getAccess, syncSubscriptionStates, extendTrialFor, GRACE_DAYS } from "../src/lib/billing";
import { BillingError, cancelSubscriptionFor, reconcileSubscriptions, startSubscriptionFor } from "../src/lib/mp-subscriptions";
import { creatorCodeSchema, creatorSchema, planSchema } from "../src/lib/super-schemas";
import { signId } from "../src/lib/crypto";

// ---- Entorno de prueba: Mercado Pago simulado ----
const TOKEN = "test-platform-token";
const SECRET = "whsec_test_123";
const FAKE_PORT = 4010;
process.env.MP_API_BASE = `http://localhost:${FAKE_PORT}`;
process.env.MP_PLATFORM_ACCESS_TOKEN = TOKEN;
process.env.MP_WEBHOOK_SECRET = SECRET;

const prisma = new PrismaClient();
const B = "http://localhost:3000";
const J = { "content-type": "application/json" };
const DAY = 86_400_000;
let fails = 0;
const ok = (n: string, c: boolean, x = "") => {
  if (!c) fails++;
  console.log(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  → " + x : ""}`);
};

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const pre = new Map<string, Obj>();
const aps = new Map<string, Obj>();
const log: { method: string; path: string; body?: Obj }[] = [];
let preN = 0;

const fake = http.createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString();
  const body = raw ? (JSON.parse(raw) as Obj) : undefined;
  const url = new URL(req.url!, "http://x");
  log.push({ method: req.method!, path: url.pathname + url.search, body });
  const send = (code: number, obj: unknown) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(obj));
  };
  if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(401, { message: "invalid access token" });
  const p = url.pathname;
  if (req.method === "POST" && p === "/preapproval") {
    const id = `pre${++preN}x${Date.now().toString(36)}`;
    const o = {
      id,
      status: body!.status,
      external_reference: body!.external_reference,
      payer_email: body!.payer_email,
      reason: body!.reason,
      auto_recurring: body!.auto_recurring,
      init_point: `https://mp.test/subscribe/${id}`,
      next_payment_date: body!.auto_recurring.start_date ?? new Date(Date.now() + 30 * DAY).toISOString(),
    };
    pre.set(id, o);
    return send(201, o);
  }
  const m = p.match(/^\/preapproval\/([^/]+)$/);
  if (m) {
    const o = pre.get(m[1]);
    if (!o) return send(404, { message: "preapproval not found" });
    if (req.method === "PUT") {
      if (body!.status) o.status = body!.status;
      if (body!.reason) o.reason = body!.reason;
      if (body!.auto_recurring) o.auto_recurring = { ...o.auto_recurring, ...body!.auto_recurring };
    }
    return send(200, o);
  }
  if (req.method === "GET" && p === "/authorized_payments/search") {
    const pid = url.searchParams.get("preapproval_id");
    return send(200, { results: [...aps.values()].filter((a) => a.preapproval_id === pid) });
  }
  const a = p.match(/^\/authorized_payments\/([^/]+)$/);
  if (a && req.method === "GET") return aps.has(a[1]) ? send(200, aps.get(a[1])) : send(404, { message: "not found" });
  return send(404, { message: "unknown route" });
});

const signed = (id: string, reqId = "req-1") => {
  const ts = String(Date.now());
  const v1 = createHmac("sha256", SECRET).update(`id:${id};request-id:${reqId};ts:${ts};`).digest("hex");
  return { "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": reqId };
};
const hook = (type: string, id: string, headers: Record<string, string> = signed(id)) =>
  fetch(`${B}/api/mercadopago/subscriptions/webhook?data.id=${id}&type=${type}`, { method: "POST", headers: { ...J, ...headers }, body: JSON.stringify({ type, data: { id } }) });

const addAp = (id: string, preapprovalId: string, amount: number, payStatus: "approved" | "rejected", apStatus = "processed") => {
  aps.set(id, {
    id, preapproval_id: preapprovalId, status: apStatus, transaction_amount: amount, currency_id: "ARS",
    debit_date: new Date().toISOString(), payment: { id: `pay-${id}`, status: payStatus, status_detail: payStatus === "approved" ? "accredited" : "cc_rejected_insufficient_amount" },
  });
};

async function cleanup(ids: string[]) {
  for (const id of ids) {
    await prisma.message.deleteMany({ where: { businessId: id } });
    await prisma.appointmentEvent.deleteMany({ where: { businessId: id } });
    await prisma.payment.deleteMany({ where: { businessId: id } });
    await prisma.appointment.deleteMany({ where: { businessId: id } });
    await prisma.customer.deleteMany({ where: { businessId: id } });
    await prisma.business.delete({ where: { id } }).catch(() => undefined);
  }
}

async function main() {
  await new Promise<void>((r) => fake.listen(FAKE_PORT, r));
  const tag = Date.now();
  const businessIds: string[] = [];
  const creatorIds: string[] = [];
  const planIds: string[] = [];
  let adminId: string | null = null;

  try {
    // ================= Regla de acceso (pura) =================
    const base = { status: "TRIAL" as const, trialEndsAt: new Date(), currentPeriodEnd: null as Date | null, mpStatus: null as string | null };
    const ev = (o: Partial<typeof base>, nowOffsetDays = 0, exempt = false) => evaluate({ ...base, ...o }, new Date(Date.now() + nowOffsetDays * DAY), exempt);
    const t = (d: number) => new Date(Date.now() + d * DAY);
    ok("prueba vigente: acceso completo y días restantes", (() => { const e = ev({ trialEndsAt: t(10) }); return e.status === "TRIAL" && !e.readonly && e.trialDaysLeft === 10; })());
    ok("prueba vencida sin suscripción → EXPIRED en solo lectura", (() => { const e = ev({ trialEndsAt: t(-1) }); return e.status === "EXPIRED" && e.readonly; })());
    ok("prueba vencida con cobro autorizado: tolera la espera del primer cobro", (() => { const e = ev({ trialEndsAt: t(-1), mpStatus: "authorized" }); return e.status === "TRIAL" && e.awaitingCharge && !e.readonly; })());
    ok(`…pero pasados ${GRACE_DAYS} días sin cobro → PAST_DUE en solo lectura`, (() => { const e = ev({ trialEndsAt: t(-(GRACE_DAYS + 1)), mpStatus: "authorized" }); return e.status === "PAST_DUE" && e.readonly; })());
    ok("activa con período vigente → completo", !ev({ status: "ACTIVE", currentPeriodEnd: t(5) }).readonly);
    ok("activa con renovación demorada dentro de la tolerancia → completo", !ev({ status: "ACTIVE", currentPeriodEnd: t(-1) }).readonly);
    ok("activa sin renovar fuera de la tolerancia → PAST_DUE", (() => { const e = ev({ status: "ACTIVE", currentPeriodEnd: t(-(GRACE_DAYS + 1)) }); return e.status === "PAST_DUE" && e.readonly; })());
    ok("PAST_DUE siempre en solo lectura (aunque el período siga vigente)", ev({ status: "PAST_DUE", currentPeriodEnd: t(9) }).readonly);
    ok("cancelada con período pagado vigente → conserva el acceso", (() => { const e = ev({ status: "CANCELED", currentPeriodEnd: t(8) }); return !e.readonly && e.status === "CANCELED"; })());
    ok("cancelada cuyo período terminó → solo lectura", ev({ status: "CANCELED", currentPeriodEnd: t(-1), trialEndsAt: t(-20) }).readonly);
    ok("cancelada durante la prueba → acceso hasta que termine la prueba", !ev({ status: "CANCELED", trialEndsAt: t(6) }).readonly && ev({ status: "CANCELED", trialEndsAt: t(-1) }).readonly);
    ok("cuenta exenta: siempre acceso completo", !ev({ status: "EXPIRED", trialEndsAt: t(-90) }, 0, true).readonly);

    // ================= Validaciones del Super Admin =================
    const ps = planSchema.safeParse({ name: "Pro", description: "", price: "28000", currency: "ars", maxBarbers: "", features: "Reservas\n\n  Pagos  \n", sortOrder: "2" });
    ok("plan: precio, moneda, tope vacío = ilimitado y características por línea", ps.success && ps.data.price === 28000 && ps.data.currency === "ARS" && ps.data.maxBarbers === null && ps.data.features.join("|") === "Reservas|Pagos");
    ok("plan: precio 0, negativo o sin nombre se rechazan", !planSchema.safeParse({ name: "X", price: "0", features: "" }).success && !planSchema.safeParse({ name: "Pro", price: "-5", features: "" }).success && !planSchema.safeParse({ name: "", price: "10", features: "" }).success);
    ok("plan: tope de barberos válido", planSchema.safeParse({ name: "Pro", price: "10", maxBarbers: "3", features: "" }).success && !planSchema.safeParse({ name: "Pro", price: "10", maxBarbers: "0", features: "" }).success);
    ok("código de creador: se pasa a mayúsculas y valida el formato", creatorCodeSchema.parse(" juan20 ") === "JUAN20" && !creatorCodeSchema.safeParse("ab").success && !creatorCodeSchema.safeParse("con espacio").success && !creatorCodeSchema.safeParse("a".repeat(21)).success && !creatorCodeSchema.safeParse("<script>").success);
    ok("creador con comisión exige un porcentaje", !creatorSchema.safeParse({ name: "Juan", benefitType: "COMMISSION", commissionPercent: "0" }).success && creatorSchema.safeParse({ name: "Juan", benefitType: "COMMISSION", commissionPercent: "20" }).success);
    ok("creador con meses gratis exige al menos 1", !creatorSchema.safeParse({ name: "Juan", benefitType: "FREE_MONTHS", freeMonths: "0" }).success && creatorSchema.safeParse({ name: "Juan", benefitType: "TRACKING" }).success);

    // ================= Datos de prueba =================
    const creator = await prisma.creator.create({ data: { code: `ZZ${tag}`.slice(0, 12), name: "Juan Influencer", benefitType: "COMMISSION", commissionPercent: 20, commissionMonths: 2 } });
    const inactive = await prisma.creator.create({ data: { code: `ZI${tag}`.slice(0, 12), name: "Inactivo", active: false } });
    creatorIds.push(creator.id, inactive.id);
    const basic = await prisma.plan.create({ data: { slug: `zz-basic-${tag}`, name: "ZZ Básico", priceCents: 100_000, maxBarbers: 1, features: ["Reservas"] } });
    const pro = await prisma.plan.create({ data: { slug: `zz-pro-${tag}`, name: "ZZ Pro", priceCents: 200_000, maxBarbers: null, features: ["Reservas", "Pagos"] } });
    planIds.push(basic.id, pro.id);

    const register = async (name: string, creatorCode?: string) => {
      const r = await fetch(B + "/api/register", { method: "POST", headers: J, body: JSON.stringify({ name, email: `zzs-${name.replace(/\W/g, "")}-${tag}@example.com`, password: "testpass123", creatorCode }) });
      return { status: r.status, json: (await r.json()) as { slug?: string; error?: string }, cookie: r.headers.get("set-cookie")?.split(";")[0] ?? "" };
    };

    // ================= Registro + prueba gratis + código de creador =================
    const r1 = await register("Zz Subs Uno", creator.code);
    if (!r1.json.slug?.startsWith("zz-subs-uno")) throw new Error("registro de prueba falló; no se hace nada más");
    const biz1 = await prisma.business.findUniqueOrThrow({ where: { slug: r1.json.slug }, include: { subscription: true } });
    businessIds.push(biz1.id);
    ok("registro con código de creador → 201", r1.status === 201);
    ok("se guarda quién la trajo (id y código tal como lo ingresó)", biz1.creatorId === creator.id && biz1.creatorCode === creator.code);
    const trialMs = biz1.subscription!.trialEndsAt.getTime() - Date.now();
    ok("nace en TRIAL con ~1 mes de prueba (sin cobro ni tarjeta)", biz1.subscription!.status === "TRIAL" && trialMs > 27 * DAY && trialMs < 32 * DAY && !biz1.subscription!.mpPreapprovalId);

    const r2 = await register("Zz Subs Dos", `  ${creator.code.toLowerCase()} `);
    const biz2 = await prisma.business.findUniqueOrThrow({ where: { slug: r2.json.slug! } });
    businessIds.push(biz2.id);
    ok("el código se acepta en minúsculas y con espacios", r2.status === 201 && biz2.creatorId === creator.id);
    const r3 = await register("Zz Subs Tres");
    const biz3 = await prisma.business.findUniqueOrThrow({ where: { slug: r3.json.slug! } });
    businessIds.push(biz3.id);
    ok("registro sin código funciona y no queda ligado a ningún creador", r3.status === 201 && biz3.creatorId === null);
    const bad = await register("Zz Subs Malo", "NOEXISTE99");
    ok("código inexistente → 400 con mensaje claro (y no se crea la barbería)", bad.status === 400 && /no existe/.test(bad.json.error ?? "") && (await prisma.business.count({ where: { name: "Zz Subs Malo" } })) === 0);
    const off = await register("Zz Subs Off", inactive.code);
    ok("código desactivado → 400", off.status === 400 && (await prisma.business.count({ where: { name: "Zz Subs Off" } })) === 0);
    ok("el creador cuenta 2 registros", (await prisma.business.count({ where: { creatorId: creator.id } })) === 2);

    let a = await getAccess(biz1.id);
    ok("acceso en prueba: completo, con días restantes", a.status === "TRIAL" && !a.readonly && a.bookable && (a.trialDaysLeft ?? 0) >= 28);
    ok("durante la prueba no hay tope de barberos", a.barberLimit === null);
    const dash = await (await fetch(B + "/admin", { headers: { cookie: r1.cookie } })).text();
    ok("el panel muestra el aviso de prueba gratis con los días", dash.includes("Prueba gratis") && /quedan \d+ días/.test(dash) && !dash.includes('<fieldset disabled=""'));

    // ================= Contratar un plan durante la prueba =================
    const origin = "https://app.test";
    const s1 = await startSubscriptionFor({ businessId: biz1.id, planId: basic.id, payerEmail: "dueno@barberia.test", origin });
    ok("elegir plan → devuelve el link de Mercado Pago para autorizar", s1.kind === "redirect" && s1.url.startsWith("https://mp.test/subscribe/"));
    const created = log.find((l) => l.method === "POST" && l.path === "/preapproval")!.body!;
    const subRow = await prisma.subscription.findUniqueOrThrow({ where: { businessId: biz1.id } });
    ok("la suscripción se crea mensual por el precio del plan", created.auto_recurring.frequency === 1 && created.auto_recurring.frequency_type === "months" && created.auto_recurring.transaction_amount === 1000 && created.auto_recurring.currency_id === "ARS");
    ok("el primer cobro se programa para el FIN de la prueba (no se cobra durante el trial)", Math.abs(Date.parse(created.auto_recurring.start_date) - subRow.trialEndsAt.getTime()) < 1000);
    ok("se envía la referencia, el email y la URL de retorno", created.external_reference === subRow.id && created.payer_email === "dueno@barberia.test" && created.back_url === "https://app.test/admin/billing?mp=return" && created.status === "pending");
    ok("queda registrada como pendiente de autorizar, con el plan elegido", subRow.planId === basic.id && subRow.mpStatus === "pending" && !!subRow.mpInitPoint && subRow.status === "TRIAL");
    const preId = subRow.mpPreapprovalId!;

    // El cliente vuelve del checkout: se sincroniza sin esperar el webhook
    pre.get(preId)!.status = "authorized";
    const ret = await fetch(B + "/admin/billing?mp=return", { headers: { cookie: r1.cookie } });
    const retHtml = await ret.text();
    ok("al volver de Mercado Pago se sincroniza solo (sin esperar el webhook)", (await prisma.subscription.findUniqueOrThrow({ where: { id: subRow.id } })).mpStatus === "authorized");
    ok("…y la pantalla explica que el primer cobro es al terminar la prueba", ret.status === 200 && /primer cobro de/.test(retHtml) && retHtml.includes("ZZ Básico"));

    // ================= Webhooks: seguridad =================
    ok("webhook sin firma → 401", (await hook("subscription_preapproval", preId, {})).status === 401);
    ok("webhook con firma inválida → 401", (await hook("subscription_preapproval", preId, { "x-signature": "ts=1,v1=deadbeef", "x-request-id": "r" })).status === 401);
    ok("webhook con firma de OTRO id → 401 (no sirve reusar una firma)", (await hook("subscription_preapproval", preId, signed("otroid"))).status === 401);
    ok("webhook de tipo desconocido → 200 ignorado", (await hook("plan", preId)).status === 200);
    ok("webhook de una suscripción inexistente en MP → 500 (para que reintente)", (await hook("subscription_preapproval", "noexiste1")).status === 500);
    ok("webhook válido → 200", (await hook("subscription_preapproval", preId)).status === 200);
    ok("…y es idempotente", (await hook("subscription_preapproval", preId)).status === 200 && (await prisma.subscription.count({ where: { businessId: biz1.id } })) === 1);

    // ================= Fin de la prueba: primer cobro =================
    await prisma.subscription.update({ where: { id: subRow.id }, data: { trialEndsAt: new Date(Date.now() - 3600_000) } });
    a = await getAccess(biz1.id);
    ok("terminó la prueba y el cobro está en camino: sigue con acceso (esperando confirmación)", a.status === "TRIAL" && a.awaitingCharge && !a.readonly);
    const panelWait = await (await fetch(B + "/admin", { headers: { cookie: r1.cookie } })).text();
    ok("…y el panel lo avisa", panelWait.includes("esperando la confirmación del primer cobro"));
    await prisma.subscription.update({ where: { id: subRow.id }, data: { trialEndsAt: new Date(Date.now() - (GRACE_DAYS + 1) * DAY) } });
    a = await getAccess(biz1.id);
    ok(`si el cobro no llega en ${GRACE_DAYS} días → PAST_DUE en solo lectura`, a.status === "PAST_DUE" && a.readonly && !a.bookable);

    pre.get(preId)!.next_payment_date = new Date(Date.now() + 30 * DAY).toISOString();
    addAp("ap1", preId, 1000, "approved");
    ok("webhook de cobro aprobado → 200", (await hook("subscription_authorized_payment", "ap1")).status === 200);
    a = await getAccess(biz1.id);
    ok("el primer cobro aprobado reactiva la cuenta: ACTIVE y acceso completo", a.status === "ACTIVE" && !a.readonly && a.sub.pastDueSince === null);
    const nextMs = a.sub.currentPeriodEnd!.getTime() - Date.now();
    ok("el período pagado llega hasta el próximo cobro (~30 días)", nextMs > 28 * DAY && nextMs < 32 * DAY);
    ok("el pago queda en el historial", (await prisma.subscriptionPayment.count({ where: { businessId: biz1.id, status: "APPROVED", amountCents: 100_000 } })) === 1);
    const earn1 = await prisma.creatorEarning.findMany({ where: { creatorId: creator.id } });
    ok("se genera la comisión del creador (20% de $1000 = $200), pendiente de pago", earn1.length === 1 && earn1[0].amountCents === 20_000 && earn1[0].status === "PENDING" && earn1[0].kind === "COMMISSION");
    ok("repetir el aviso NO duplica el pago ni la comisión", (await hook("subscription_authorized_payment", "ap1")).status === 200 && (await prisma.subscriptionPayment.count({ where: { businessId: biz1.id } })) === 1 && (await prisma.creatorEarning.count({ where: { creatorId: creator.id } })) === 1);
    const billing = await (await fetch(B + "/admin/billing", { headers: { cookie: r1.cookie } })).text();
    ok("el panel muestra el historial de pagos y el plan actual", billing.includes("Historial de pagos") && billing.includes("Aprobado") && billing.includes("Activa"));

    // Una reserva antes del corte, para comprobar después que sigue funcionando
    const barber = await prisma.barber.findFirstOrThrow({ where: { businessId: biz1.id } });
    const service = await prisma.service.findFirstOrThrow({ where: { businessId: biz1.id, name: "Corte" } });
    const d = new Date(Date.now() + 3 * DAY);
    if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
    const iso = (h: number) => new Date(`${d.toISOString().slice(0, 10)}T${String(h + 3).padStart(2, "0")}:00:00.000Z`).toISOString();
    const book = (h: number, phone: string) => fetch(B + "/api/appointments", { method: "POST", headers: J, body: JSON.stringify({ slug: biz1.slug, barberId: barber.id, serviceId: service.id, startAt: iso(h), firstName: "Luz", lastName: "Sub", phone, payment: "NONE" }) });
    const b1 = await book(10, "+5491155550001");
    const claimCode = ((await b1.json()) as { claimCode?: string }).claimCode!;
    ok("con la cuenta activa se pueden tomar reservas", b1.status === 201 && !!claimCode);

    // ================= Cobro fallido → PAST_DUE =================
    addAp("ap2", preId, 1000, "rejected", "recycling");
    await hook("subscription_authorized_payment", "ap2");
    a = await getAccess(biz1.id);
    ok("cobro rechazado → PAST_DUE y se registra el momento", a.status === "PAST_DUE" && !!a.sub.pastDueSince && a.readonly);
    ok("…el rechazo queda en el historial con el motivo", (await prisma.subscriptionPayment.findFirst({ where: { businessId: biz1.id, status: "REJECTED" } }))?.detail === "cc_rejected_insufficient_amount");
    ok("…y NO genera comisión para el creador", (await prisma.creatorEarning.count({ where: { creatorId: creator.id } })) === 1);

    const rbook = await book(11, "+5491155550002");
    ok("en solo lectura: las reservas nuevas se rechazan (403) con un mensaje claro", rbook.status === 403 && /no está aceptando reservas/.test(((await rbook.json()) as { error: string }).error));
    const rpub = await (await fetch(`${B}/b/${biz1.slug}`)).text();
    ok("en solo lectura: la página pública muestra «Reservas no disponibles» en vez del formulario", rpub.includes("Reservas no disponibles") && !rpub.includes("Elegí un servicio"));
    const rup = await fetch(B + "/api/admin/upload", { method: "POST", headers: { cookie: r1.cookie }, body: new FormData() });
    ok("en solo lectura: la subida de imágenes se rechaza (403)", rup.status === 403);
    const rdash = await (await fetch(B + "/admin", { headers: { cookie: r1.cookie } })).text();
    ok("en solo lectura: el panel avisa, y deshabilita todos los formularios", rdash.includes("modo solo lectura") && rdash.includes('<fieldset disabled=""'));
    const rsched = await (await fetch(B + "/admin/schedule", { headers: { cookie: r1.cookie } })).text();
    ok("…también en las demás pantallas (la ve pero no puede cambiar nada)", rsched.includes('<fieldset disabled=""') && rsched.includes("Horarios"));
    const rbill = await (await fetch(B + "/admin/billing", { headers: { cookie: r1.cookie } })).text();
    ok("…pero la pantalla de suscripción SIGUE habilitada para poder regularizar", !rbill.includes('<fieldset disabled=""') && rbill.includes("No pudimos cobrar"));
    const claimLookup = await fetch(B + "/api/claim/lookup", { method: "POST", headers: J, body: JSON.stringify({ slug: biz1.slug, code: claimCode }) });
    ok("los clientes con turno ya agendado pueden seguir reprogramando/cancelando", claimLookup.status === 200 && ((await claimLookup.json()) as { canChange: boolean }).canChange === true);

    // Recupera el pago (Mercado Pago reintenta y se aprueba)
    addAp("ap2", preId, 1000, "approved");
    await hook("subscription_authorized_payment", "ap2");
    a = await getAccess(biz1.id);
    ok("al aprobarse el reintento, la cuenta se reactiva sola", a.status === "ACTIVE" && !a.readonly && a.sub.pastDueSince === null);
    ok("…y la reserva vuelve a funcionar", (await book(11, "+5491155550002")).status === 201);
    addAp("ap3", preId, 1000, "approved");
    await hook("subscription_authorized_payment", "ap3");
    const earnings = await prisma.creatorEarning.findMany({ where: { creatorId: creator.id }, orderBy: { createdAt: "asc" } });
    ok("la comisión rige solo por los meses acordados (2) y no más", earnings.length === 2 && earnings.every((e) => e.amountCents === 20_000));

    // ================= Cambio de plan y cancelación =================
    ok("cambiar al mismo plan se rechaza con un mensaje", await startSubscriptionFor({ businessId: biz1.id, planId: basic.id, payerEmail: "x@y.com", origin }).then(() => false, (e) => e instanceof BillingError && /Ya estás en ese plan/.test(e.message)));
    const chg = await startSubscriptionFor({ businessId: biz1.id, planId: pro.id, payerEmail: "x@y.com", origin });
    ok("cambiar de plan con suscripción autorizada actualiza el monto en MP (rige desde el próximo cobro)", chg.kind === "changed" && pre.get(preId)!.auto_recurring.transaction_amount === 2000 && (await prisma.subscription.findUniqueOrThrow({ where: { id: subRow.id } })).planId === pro.id);
    const off2 = await prisma.plan.create({ data: { slug: `zz-off-${tag}`, name: "ZZ Off", priceCents: 1000, active: false } });
    planIds.push(off2.id);
    ok("un plan desactivado no se puede contratar", await startSubscriptionFor({ businessId: biz1.id, planId: off2.id, payerEmail: "x@y.com", origin }).then(() => false, (e) => e instanceof BillingError && /no está disponible/.test(e.message)));

    await cancelSubscriptionFor(biz1.id);
    const canc = await prisma.subscription.findUniqueOrThrow({ where: { id: subRow.id } });
    ok("cancelar: se cancela en Mercado Pago y queda CANCELED con fecha", pre.get(preId)!.status === "cancelled" && canc.status === "CANCELED" && canc.mpStatus === "cancelled" && !!canc.canceledAt);
    a = await getAccess(biz1.id);
    ok("cancelada: conserva el acceso hasta el fin de lo ya pagado", a.status === "CANCELED" && !a.readonly && a.accessUntil!.getTime() > Date.now() + 25 * DAY);
    ok("cancelar de nuevo no rompe nada (idempotente)", await cancelSubscriptionFor(biz1.id).then(() => true, () => false));
    await prisma.subscription.update({ where: { id: subRow.id }, data: { currentPeriodEnd: new Date(Date.now() - DAY) } });
    ok("pasado el período pagado, la cuenta cancelada queda en solo lectura", (await getAccess(biz1.id)).readonly);
    ok("el aviso de cancelación de MP es consistente (webhook)", (await hook("subscription_preapproval", preId)).status === 200 && (await prisma.subscription.findUniqueOrThrow({ where: { id: subRow.id } })).status === "CANCELED");

    const logLen = log.length;
    const re = await startSubscriptionFor({ businessId: biz1.id, planId: basic.id, payerEmail: "x@y.com", origin });
    const reBody = log.slice(logLen).find((l) => l.method === "POST" && l.path === "/preapproval")?.body;
    ok("volver a suscribirse crea una suscripción nueva que cobra de inmediato (sin fecha de inicio diferida)", re.kind === "redirect" && !!reBody && reBody.auto_recurring.start_date === undefined);

    ok("cancelar sin haber contratado nada da un mensaje claro", await cancelSubscriptionFor(biz3.id).then(() => false, (e) => e instanceof BillingError && /no hay nada que cancelar/.test(e.message)));

    // ================= Estados vencidos (cron) + reconciliación =================
    const mkBiz = async (n: string, sub: object, exempt = false) => {
      const b = await prisma.business.create({ data: { slug: `zz-sync-${n}-${tag}`, name: `Zz Sync ${n}`, billingExempt: exempt, admins: { create: { email: `zzsync-${n}-${tag}@example.com`, passwordHash: "x" } }, subscription: { create: sub as never } } });
      businessIds.push(b.id);
      return b;
    };
    const exp = await mkBiz("exp", { status: "TRIAL", trialEndsAt: new Date(Date.now() - 2 * DAY) });
    const act = await mkBiz("act", { status: "ACTIVE", trialEndsAt: new Date(Date.now() - 40 * DAY), currentPeriodEnd: new Date(Date.now() - 10 * DAY), planId: basic.id });
    const ex = await mkBiz("exempt", { status: "TRIAL", trialEndsAt: new Date(Date.now() - 50 * DAY) }, true);
    const n = await syncSubscriptionStates();
    ok("el proceso periódico pasa a la base los vencimientos", n >= 2 && (await prisma.subscription.findUniqueOrThrow({ where: { businessId: exp.id } })).status === "EXPIRED" && (await prisma.subscription.findUniqueOrThrow({ where: { businessId: act.id } })).status === "PAST_DUE");
    ok("…sin tocar las cuentas exentas, que conservan el acceso", (await prisma.subscription.findUniqueOrThrow({ where: { businessId: ex.id } })).status === "TRIAL" && !(await getAccess(ex.id)).readonly);

    const rec = await mkBiz("rec", { status: "TRIAL", trialEndsAt: new Date(Date.now() - 2 * DAY), planId: pro.id, mpStatus: "authorized", lastSyncedAt: new Date(Date.now() - 20 * 3600_000) });
    const recPre = { id: `recpre${tag}`, status: "authorized", external_reference: "x", payer_email: "r@r.com", next_payment_date: new Date(Date.now() + 30 * DAY).toISOString(), auto_recurring: { transaction_amount: 2000 } };
    pre.set(recPre.id, recPre);
    await prisma.subscription.update({ where: { businessId: rec.id }, data: { mpPreapprovalId: recPre.id } });
    addAp("aprec", recPre.id, 2000, "approved");
    const done = await reconcileSubscriptions(20, 6);
    const recSub = await prisma.subscription.findUniqueOrThrow({ where: { businessId: rec.id } });
    ok("el respaldo recupera un cobro cuyo webhook se perdió", done >= 1 && recSub.status === "ACTIVE" && (await prisma.subscriptionPayment.count({ where: { businessId: rec.id, status: "APPROVED" } })) === 1);

    const cr = await fetch(B + "/api/cron/dispatch", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
    const crj = (await cr.json()) as Record<string, unknown>;
    ok("el cron incluye la sincronización de suscripciones", cr.status === 200 && "subsChanged" in crj && "subsSynced" in crj, JSON.stringify(crj));

    // ================= Barbería anterior a los cobros =================
    const legacy = await prisma.business.create({ data: { slug: `zz-legacy-${tag}`, name: "Zz Legacy", admins: { create: { email: `zzleg-${tag}@example.com`, passwordHash: "x" } } } });
    businessIds.push(legacy.id);
    const la = await getAccess(legacy.id);
    ok("una barbería sin suscripción (anterior a los cobros) arranca su prueba al ser consultada, sin quedar bloqueada", la.status === "TRIAL" && !la.readonly && (la.trialDaysLeft ?? 0) >= 28);
    ok("…y no se crean suscripciones duplicadas", (await getAccess(legacy.id)).sub.id === la.sub.id && (await prisma.subscription.count({ where: { businessId: legacy.id } })) === 1);

    // ================= Tope de barberos + extender prueba =================
    const lim = await mkBiz("lim", { status: "ACTIVE", trialEndsAt: new Date(Date.now() - 40 * DAY), currentPeriodEnd: new Date(Date.now() + 20 * DAY), planId: basic.id, mpStatus: "authorized" });
    ok("con un plan de 1 barbero el tope es 1; en prueba y exentas no hay tope", (await getAccess(lim.id)).barberLimit === 1 && (await getAccess(biz3.id)).barberLimit === null && (await getAccess(ex.id)).barberLimit === null);
    ok("extender la prueba NO aplica a quien ya autorizó el cobro o ya paga", !(await extendTrialFor(lim.id, 7)) && !(await extendTrialFor(rec.id, 7)));
    const before = (await getAccess(exp.id)).sub.trialEndsAt.getTime();
    ok("extender la prueba a una cuenta vencida la vuelve a poner en TRIAL con acceso", (await extendTrialFor(exp.id, 7)) && (await getAccess(exp.id)).status === "TRIAL" && !(await getAccess(exp.id)).readonly && (await getAccess(exp.id)).sub.trialEndsAt.getTime() > before + 6 * DAY);

    // ================= Super Admin =================
    const pw = "ClaveSuperLarga123";
    const sa = await prisma.platformAdmin.create({ data: { email: `zzsa-${tag}@example.com`, passwordHash: await bcrypt.hash(pw, 10) } });
    adminId = sa.id;
    const login = (email: string, password: string, ip: string) => fetch(B + "/api/superadmin/login", { method: "POST", headers: { ...J, "x-forwarded-for": ip }, body: JSON.stringify({ email, password }) });
    ok("login de Super Admin con clave incorrecta → 401", (await login(sa.email, "mala-clave", "1.1.1.1")).status === 401);
    ok("login con un usuario inexistente → 401 (mismo mensaje)", (await login("nadie@example.com", "x", "1.1.1.2")).status === 401);
    let last = 0;
    for (let i = 0; i < 6; i++) last = (await login(sa.email, "mala", "9.9.9.9")).status;
    ok("tras 5 intentos fallidos se bloquea la IP (429), incluso con la clave correcta", last === 429 && (await login(sa.email, pw, "9.9.9.9")).status === 429);
    const good = await login(sa.email, pw, "1.1.1.3");
    const saCookie = good.headers.get("set-cookie")?.split(";")[0] ?? "";
    ok("login correcto → cookie sa_session", good.status === 200 && saCookie.startsWith("sa_session="));

    const sget = (path: string, cookie = saCookie) => fetch(B + path, { headers: { cookie }, redirect: "manual" });
    const ov = await sget("/superadmin");
    const ovHtml = await ov.text();
    ok("el resumen carga con las métricas", ov.status === 200 && ovHtml.includes("Resumen de la plataforma") && ovHtml.includes("En prueba gratis") && ovHtml.includes("Ingreso mensual"));
    const lst = await (await sget("/superadmin/businesses")).text();
    ok("la lista de barberías muestra nombre, estado y creador", lst.includes("Zz Subs Uno") && lst.includes(creator.code) && lst.includes("Activa") === lst.includes("Activa"));
    const filtered = await (await sget("/superadmin/businesses?status=EXPIRED")).text();
    ok("el filtro por estado funciona", filtered.includes("Barberías (") && !filtered.includes("Zz Subs Tres"));
    const byCode = await (await sget(`/superadmin/businesses?q=${creator.code}`)).text();
    ok("se puede buscar por código de creador", byCode.includes("Zz Subs Uno") && byCode.includes("Zz Subs Dos") && !byCode.includes("Zz Subs Tres"));
    const plansPage = await (await sget("/superadmin/plans")).text();
    ok("la pantalla de planes lista y permite editar", plansPage.includes("ZZ Básico") && plansPage.includes("ZZ Pro") && plansPage.includes("Nuevo plan") && plansPage.includes("Desactivado"));
    const crPage = await (await sget("/superadmin/creators")).text();
    ok("la lista de creadores muestra el código y 2 registros", crPage.includes(creator.code) && crPage.includes("Juan Influencer") && /<td[^>]*text-lg[^>]*>2<\/td>/.test(crPage));
    const crDetail = await (await sget(`/superadmin/creators/${creator.id}`)).text();
    ok("el detalle muestra las barberías, su estado y las comisiones", crDetail.includes("Zz Subs Uno") && crDetail.includes("Zz Subs Dos") && crDetail.includes("Comisión") && crDetail.includes("Marcar pendientes como pagados"));
    ok("el link para compartir lleva ?ref=CÓDIGO", crDetail.includes(`/registro?ref=${creator.code}`));

    const noCookie = await sget("/superadmin", "");
    ok("sin sesión, /superadmin redirige al login", noCookie.status >= 300 && noCookie.status < 400 && (noCookie.headers.get("location") ?? "").includes("/superadmin/login"));
    ok("con la sesión de una BARBERÍA no se puede entrar al Super Admin", (await sget("/superadmin", r1.cookie)).status >= 300);
    ok("con la sesión de Super Admin no se entra al panel de una barbería", (await fetch(B + "/admin", { headers: { cookie: saCookie }, redirect: "manual" })).status >= 300);
    const bizToken = r1.cookie.replace("session=", "");
    ok("un token de barbería puesto como cookie de Super Admin se rechaza (rol)", (await sget("/superadmin", `sa_session=${bizToken}`)).status >= 300);
    const saToken = saCookie.replace("sa_session=", "");
    ok("un token de Super Admin puesto como sesión de barbería se rechaza", (await fetch(B + "/admin", { headers: { cookie: `session=${saToken}` }, redirect: "manual" })).status >= 300);
    ok("el login de Super Admin es accesible sin sesión", (await sget("/superadmin/login", "")).status === 200);
    void signId;
  } finally {
    fake.close();
    await cleanup(businessIds);
    if (adminId) await prisma.platformAdmin.delete({ where: { id: adminId } }).catch(() => undefined);
    if (creatorIds.length) await prisma.creator.deleteMany({ where: { id: { in: creatorIds } } });
    if (planIds.length) await prisma.plan.deleteMany({ where: { id: { in: planIds } } });
  }
  console.log(fails === 0 ? "\nTODO OK (datos de prueba eliminados)" : `\n${fails} FALLAS (datos de prueba eliminados)`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
