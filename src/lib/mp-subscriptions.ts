import { createHmac, timingSafeEqual } from "node:crypto";
import { DateTime } from "luxon";
import { Prisma, type Plan, type Subscription } from "@prisma/client";
import { prisma } from "./db";

// Suscripciones de las barberías a la PLATAFORMA con Mercado Pago (API de Preapproval / Suscripciones).
// Usa la cuenta de Mercado Pago del dueño de la plataforma (MP_PLATFORM_ACCESS_TOKEN), distinta de la de cada barbería.

const apiBase = () => (process.env.MP_API_BASE ?? "https://api.mercadopago.com").replace(/\/$/, "");
export const billingConfigured = () => !!process.env.MP_PLATFORM_ACCESS_TOKEN;
const APP_NAME = () => process.env.APP_NAME ?? "Turnos";

/** Error con un mensaje apto para mostrarle al usuario. */
export class BillingError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

async function mp<T>(method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<T> {
  const token = process.env.MP_PLATFORM_ACCESS_TOKEN;
  if (!token) throw new BillingError("Los cobros de suscripciones todavía no están configurados en la plataforma.", 503);
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new BillingError("No se pudo conectar con Mercado Pago. Intentá de nuevo en unos minutos.", 502);
  }
  const json = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  if (!res.ok) {
    console.error("mercadopago", method, path, res.status, json);
    const detail = typeof json.message === "string" ? json.message : (json.error ?? `HTTP ${res.status}`);
    throw new BillingError(`Mercado Pago no aceptó la operación (${detail.slice(0, 160)}).`, res.status >= 500 ? 502 : 400);
  }
  return json as T;
}

export type MpPreapproval = {
  id: string;
  status: string;
  external_reference?: string;
  payer_email?: string;
  next_payment_date?: string;
  init_point?: string;
  reason?: string;
  auto_recurring?: { transaction_amount?: number; currency_id?: string; start_date?: string };
};

export type MpAuthorizedPayment = {
  id: number | string;
  preapproval_id: number | string;
  status: string;
  transaction_amount: number;
  currency_id?: string;
  date_created?: string;
  debit_date?: string;
  reason?: string;
  payment?: { id?: number | string; status?: string; status_detail?: string } | null;
};

const arDate = (d: Date) => DateTime.fromJSDate(d).setZone("America/Argentina/Buenos_Aires").toISO()!;

export const getPreapproval = (id: string) => mp<MpPreapproval>("GET", `/preapproval/${encodeURIComponent(id)}`);
export const updatePreapproval = (id: string, body: unknown) => mp<MpPreapproval>("PUT", `/preapproval/${encodeURIComponent(id)}`, body);
export const getAuthorizedPayment = (id: string) => mp<MpAuthorizedPayment>("GET", `/authorized_payments/${encodeURIComponent(id)}`);
export const searchAuthorizedPayments = (preapprovalId: string) =>
  mp<{ results?: MpAuthorizedPayment[] }>("GET", `/authorized_payments/search?preapproval_id=${encodeURIComponent(preapprovalId)}`);

/** Crea la suscripción. Si la prueba sigue vigente, el primer cobro se programa para el día en que termina. */
function createPreapproval(sub: Subscription, plan: Plan, payerEmail: string, origin: string) {
  const startsLater = sub.trialEndsAt.getTime() > Date.now() + 10 * 60_000;
  return mp<MpPreapproval>("POST", "/preapproval", {
    reason: `${APP_NAME()} · Plan ${plan.name}`,
    external_reference: sub.id,
    payer_email: payerEmail,
    back_url: `${origin}/admin/billing?mp=return`,
    status: "pending",
    auto_recurring: {
      frequency: 1,
      frequency_type: "months",
      transaction_amount: plan.priceCents / 100,
      currency_id: plan.currency,
      ...(startsLater ? { start_date: arDate(sub.trialEndsAt) } : {}),
    },
  });
}

// ---------------------------------------------------------------------------------------------------------
// Operaciones que dispara la barbería (la lógica vive acá; las server actions son envoltorios finos)
// ---------------------------------------------------------------------------------------------------------

async function loadSub(businessId: string) {
  const sub = await prisma.subscription.findUnique({ where: { businessId }, include: { business: { select: { billingExempt: true } } } });
  if (!sub) throw new BillingError("No encontramos tu suscripción.", 404);
  if (sub.business.billingExempt) throw new BillingError("Tu cuenta no requiere suscripción.", 400);
  return sub;
}

export type StartResult = { kind: "redirect"; url: string } | { kind: "changed"; message: string };

/**
 * Contratar un plan, o cambiarlo si ya hay una suscripción autorizada.
 * - Primera vez / suscripción cancelada o vencida: devuelve el link de Mercado Pago para autorizarla.
 * - Ya autorizada: actualiza el monto (rige desde el próximo cobro).
 */
export async function startSubscriptionFor(args: { businessId: string; planId: string; payerEmail: string; origin: string }): Promise<StartResult> {
  const plan = await prisma.plan.findFirst({ where: { id: args.planId, active: true } });
  if (!plan) throw new BillingError("Ese plan ya no está disponible.");
  const sub = await loadSub(args.businessId);

  if (sub.mpPreapprovalId && sub.mpStatus === "authorized" && sub.status !== "CANCELED") {
    if (sub.planId === plan.id) throw new BillingError("Ya estás en ese plan.");
    await updatePreapproval(sub.mpPreapprovalId, {
      reason: `${APP_NAME()} · Plan ${plan.name}`,
      auto_recurring: { transaction_amount: plan.priceCents / 100, currency_id: plan.currency },
    });
    await prisma.subscription.update({ where: { id: sub.id }, data: { planId: plan.id } });
    return { kind: "changed", message: `Cambiaste al plan ${plan.name}. El nuevo precio rige desde tu próximo cobro.` };
  }

  // Una autorización anterior que quedó sin completar se descarta para no dejar dos suscripciones abiertas.
  if (sub.mpPreapprovalId && sub.mpStatus === "pending") {
    await updatePreapproval(sub.mpPreapprovalId, { status: "cancelled" }).catch(() => undefined);
  }

  const pre = await createPreapproval(sub, plan, args.payerEmail, args.origin);
  if (!pre.id || !pre.init_point) throw new BillingError("Mercado Pago no devolvió el link para autorizar la suscripción.", 502);
  await prisma.subscription.update({
    where: { id: sub.id },
    data: { planId: plan.id, mpPreapprovalId: String(pre.id), mpStatus: pre.status ?? "pending", mpInitPoint: pre.init_point, payerEmail: args.payerEmail, canceledAt: null },
  });
  return { kind: "redirect", url: pre.init_point };
}

/** Cancela la suscripción en Mercado Pago. Conserva el acceso hasta el fin de lo ya pagado (o de la prueba). */
export async function cancelSubscriptionFor(businessId: string) {
  const sub = await loadSub(businessId);
  if (!sub.mpPreapprovalId) throw new BillingError("Todavía no contrataste ningún plan, no hay nada que cancelar.");
  if (sub.mpStatus === "cancelled") return;
  await updatePreapproval(sub.mpPreapprovalId, { status: "cancelled" });
  await prisma.subscription.update({ where: { id: sub.id }, data: { status: "CANCELED", mpStatus: "cancelled", canceledAt: new Date() } });
}

// ---------------------------------------------------------------------------------------------------------
// Sincronización: lo que informa Mercado Pago (webhooks) y el respaldo periódico
// ---------------------------------------------------------------------------------------------------------

async function findSubscription(preapprovalId: string, externalRef?: string) {
  const byMp = await prisma.subscription.findUnique({ where: { mpPreapprovalId: preapprovalId } });
  if (byMp) return byMp;
  return externalRef ? prisma.subscription.findUnique({ where: { id: externalRef } }) : null;
}

/** Aplica el estado actual de una suscripción de Mercado Pago (siempre se consulta el recurso, nunca se confía en el aviso). */
export async function applyPreapproval(pre: MpPreapproval) {
  const sub = await findSubscription(String(pre.id), pre.external_reference);
  if (!sub) return null;
  const now = new Date();
  const data: Prisma.SubscriptionUpdateInput = {
    mpPreapprovalId: String(pre.id),
    mpStatus: pre.status,
    lastSyncedAt: now,
    ...(pre.payer_email ? { payerEmail: pre.payer_email } : {}),
    ...(pre.next_payment_date ? { nextPaymentAt: new Date(pre.next_payment_date) } : {}),
  };
  if (pre.status === "authorized") {
    data.canceledAt = null;
    // Se volvió a suscribir dentro de la prueba: vuelve a estar en prueba hasta el primer cobro.
    if ((sub.status === "CANCELED" || sub.status === "EXPIRED") && sub.trialEndsAt.getTime() > now.getTime()) data.status = "TRIAL";
  } else if (pre.status === "cancelled") {
    data.status = "CANCELED";
    if (!sub.canceledAt) data.canceledAt = now;
  } else if (pre.status === "paused") {
    data.status = "PAST_DUE";
    if (!sub.pastDueSince) data.pastDueSince = now;
  }
  return prisma.subscription.update({ where: { id: sub.id }, data });
}

/** Aplica un cobro de la suscripción. Idempotente: el mismo aviso N veces deja un solo registro y no duplica comisiones. */
export async function applyAuthorizedPayment(ap: MpAuthorizedPayment) {
  const sub = await prisma.subscription.findUnique({
    where: { mpPreapprovalId: String(ap.preapproval_id) },
    include: { business: { select: { id: true, name: true, creatorId: true } } },
  });
  if (!sub) return null;

  const paymentStatus = ap.payment?.status;
  const outcome =
    paymentStatus === "approved"
      ? ("APPROVED" as const)
      : paymentStatus === "rejected" || paymentStatus === "cancelled" || ap.status === "recycling" || ap.status === "cancelled"
        ? ("REJECTED" as const)
        : ("PENDING" as const);

  const key = String(ap.id);
  const existing = await prisma.subscriptionPayment.findUnique({ where: { mpAuthorizedPaymentId: key } });
  if (existing?.status === "APPROVED") return existing; // un cobro aprobado no se revierte ni se vuelve a procesar

  const paidAt = outcome === "APPROVED" ? new Date(ap.debit_date ?? ap.date_created ?? Date.now()) : null;
  const row = await prisma.subscriptionPayment.upsert({
    where: { mpAuthorizedPaymentId: key },
    create: {
      subscriptionId: sub.id,
      businessId: sub.businessId,
      mpAuthorizedPaymentId: key,
      mpPaymentId: ap.payment?.id != null ? String(ap.payment.id) : null,
      amountCents: Math.round(ap.transaction_amount * 100),
      currency: ap.currency_id ?? "ARS",
      status: outcome,
      detail: ap.payment?.status_detail ?? ap.status,
      paidAt,
    },
    update: { status: outcome, detail: ap.payment?.status_detail ?? ap.status, paidAt, mpPaymentId: ap.payment?.id != null ? String(ap.payment.id) : undefined },
  });
  if (existing && existing.status === outcome) return row; // sin cambios

  if (outcome === "APPROVED") {
    const pre = await getPreapproval(String(ap.preapproval_id)).catch(() => null);
    const next = pre?.next_payment_date ? new Date(pre.next_payment_date) : DateTime.fromJSDate(paidAt!).plus({ months: 1 }).toJSDate();
    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: sub.status === "CANCELED" ? "CANCELED" : "ACTIVE", // un cobro tardío no "des-cancela" la cuenta
        pastDueSince: null,
        currentPeriodEnd: next,
        nextPaymentAt: next,
        lastSyncedAt: new Date(),
        ...(pre?.status ? { mpStatus: pre.status } : {}),
      },
    });
    await recordCreatorEarnings(row.id, sub.business, row.amountCents, sub.id);
  } else if (outcome === "REJECTED" && sub.status !== "CANCELED") {
    await prisma.subscription.update({ where: { id: sub.id }, data: { status: "PAST_DUE", pastDueSince: sub.pastDueSince ?? new Date(), lastSyncedAt: new Date() } });
  }
  return row;
}

/** Genera lo que se le debe al creador por un cobro aprobado (comisión o meses gratis). El pago al creador es manual por ahora. */
async function recordCreatorEarnings(paymentId: string, business: { id: string; name: string; creatorId: string | null }, amountCents: number, subscriptionId: string) {
  if (!business.creatorId) return;
  const creator = await prisma.creator.findUnique({ where: { id: business.creatorId } });
  if (!creator) return;
  const create = async (data: Omit<Prisma.CreatorEarningUncheckedCreateInput, "creatorId" | "businessId" | "businessName" | "subscriptionPaymentId">) => {
    try {
      await prisma.creatorEarning.create({ data: { creatorId: creator.id, businessId: business.id, businessName: business.name, subscriptionPaymentId: paymentId, ...data } });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e; // ya registrado: idempotente
    }
  };

  if (creator.benefitType === "COMMISSION" && creator.commissionPercent > 0) {
    const prior = creator.commissionMonths == null ? 0 : await prisma.creatorEarning.count({ where: { creatorId: creator.id, businessId: business.id, kind: "COMMISSION", status: { not: "VOID" } } });
    if (creator.commissionMonths == null || prior < creator.commissionMonths) {
      await create({ kind: "COMMISSION", amountCents: Math.round((amountCents * creator.commissionPercent) / 100) });
    }
  }
  if (creator.benefitType === "FREE_MONTHS" && creator.freeMonths > 0) {
    // Una sola vez por barbería: cuando empieza a pagar.
    const approved = await prisma.subscriptionPayment.count({ where: { subscriptionId, status: "APPROVED" } });
    if (approved === 1) await create({ kind: "FREE_MONTHS", months: creator.freeMonths });
  }
}

/** Refresca YA la suscripción de una barbería (al volver del checkout, sin esperar el aviso). Nunca falla hacia afuera. */
export async function syncSubscriptionNow(businessId: string) {
  if (!billingConfigured()) return;
  try {
    const sub = await prisma.subscription.findUnique({ where: { businessId } });
    if (!sub?.mpPreapprovalId) return;
    await applyPreapproval(await getPreapproval(sub.mpPreapprovalId));
    const list = await searchAuthorizedPayments(sub.mpPreapprovalId);
    for (const ap of (list.results ?? []).slice(0, 12).reverse()) await applyAuthorizedPayment(ap);
  } catch (e) {
    console.error("syncSubscriptionNow", e); // el webhook o el cron lo resolverán
  }
}

/**
 * Respaldo de los webhooks: refresca las suscripciones que hace rato no se sincronizan (por si un aviso se perdió).
 * Limitado por corrida para no saturar la API; el cron lo recorre de a poco.
 */
export async function reconcileSubscriptions(limit = 15, olderThanHours = 6) {
  if (!billingConfigured()) return 0;
  const cutoff = new Date(Date.now() - olderThanHours * 3600_000);
  const subs = await prisma.subscription.findMany({
    where: { mpPreapprovalId: { not: null }, NOT: { mpStatus: "cancelled" }, OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: cutoff } }] },
    orderBy: { lastSyncedAt: { sort: "asc", nulls: "first" } },
    take: limit,
  });
  let done = 0;
  for (const s of subs) {
    try {
      await applyPreapproval(await getPreapproval(s.mpPreapprovalId!));
      const list = await searchAuthorizedPayments(s.mpPreapprovalId!);
      // De más viejo a más nuevo: el último en procesarse define el estado actual.
      for (const ap of (list.results ?? []).slice(0, 12).reverse()) await applyAuthorizedPayment(ap);
      done++;
    } catch (e) {
      console.error("reconcile", s.id, e);
      await prisma.subscription.update({ where: { id: s.id }, data: { lastSyncedAt: new Date() } }); // rota para no trabarse en uno roto
    }
  }
  return done;
}

/**
 * Firma de los webhooks de Mercado Pago (x-signature). Si MP_WEBHOOK_SECRET está configurado, se exige.
 * Manifest: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` firmado con HMAC-SHA256.
 */
export function verifyWebhookSignature(headers: Headers, dataId: string | null) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return true;
  const sig = headers.get("x-signature");
  const reqId = headers.get("x-request-id") ?? "";
  if (!sig || !dataId) return false;
  const parts = Object.fromEntries(sig.split(",").map((p) => p.trim().split("=") as [string, string]));
  if (!parts.ts || !parts.v1) return false;
  const id = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  const expected = createHmac("sha256", secret).update(`id:${id};request-id:${reqId};ts:${parts.ts};`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}
