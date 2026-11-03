import { MercadoPagoConfig, Preference, Payment as MPPayment } from "mercadopago";
import type { Business, PaymentKind, PaymentState } from "@prisma/client";
import { prisma } from "./db";
import { decryptSecret, signId } from "./crypto";
import { HOLD_MINUTES, type PayConfig } from "./payment-math";
import { enqueueBookingMessages } from "./outbox";

type BusinessPay = Pick<Business, "paymentsEnabled" | "paymentMode" | "depositType" | "depositValue" | "allowPayLater"> & {
  /** Solo si la consulta lo incluyó (checkout). undefined = no cargado; null = sin credenciales. */
  mpAccessToken?: string | null;
};

/**
 * Configuración de pagos que ve el cliente. Los pagos se ofrecen si están activados Y hay credenciales:
 * el panel solo permite activarlos con token, y quitar el token los desactiva; en el checkout
 * (donde sí se carga el token) además se verifica de forma explícita.
 */
export function payConfig(b: BusinessPay): PayConfig {
  return {
    enabled: b.paymentsEnabled && b.mpAccessToken !== null,
    mode: b.paymentMode,
    depositType: b.depositType,
    depositValue: b.depositValue,
    allowPayLater: b.allowPayLater,
  };
}

/** Origen público (https://dominio) para armar back_urls y webhook. */
export function siteOrigin(req: Request) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? new URL(req.url).host;
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

const client = (b: Pick<Business, "mpAccessToken">) =>
  new MercadoPagoConfig({ accessToken: decryptSecret(b.mpAccessToken!), options: { timeout: 10_000 } });

/** Comprueba un Access Token contra Mercado Pago y devuelve una etiqueta de la cuenta. */
export async function verifyMpToken(token: string): Promise<{ ok: true; label: string } | { ok: false; error: string }> {
  try {
    const res = await fetch("https://api.mercadopago.com/users/me", { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401 || res.status === 403) return { ok: false, error: "Mercado Pago rechazó el Access Token. Revisá que esté completo y sea de producción." };
    if (!res.ok) return { ok: false, error: `Mercado Pago respondió ${res.status}. Intentá de nuevo.` };
    const u = (await res.json()) as { nickname?: string; email?: string; id?: number };
    return { ok: true, label: u.nickname || u.email || `Cuenta ${u.id ?? ""}`.trim() };
  } catch {
    return { ok: false, error: "No se pudo conectar con Mercado Pago. Intentá de nuevo." };
  }
}

/** Crea la preferencia de Checkout Pro de un cobro. */
export async function createCheckout(
  b: Business,
  appt: { id: string },
  pay: { id: string; amountCents: number; kind: PaymentKind },
  serviceName: string,
  origin: string,
) {
  const https = origin.startsWith("https://");
  const back = `${origin}/b/${b.slug}/pago?a=${appt.id}&t=${signId("appt", appt.id)}`;
  const title = `${pay.kind === "DEPOSIT" ? "Seña · " : ""}${serviceName} · ${b.name}`.slice(0, 250);

  const pref = await new Preference(client(b)).create({
    body: {
      items: [{ id: pay.id, title, quantity: 1, unit_price: pay.amountCents / 100, currency_id: b.currency }],
      external_reference: pay.id,
      back_urls: { success: back, failure: back, pending: back },
      // Mercado Pago exige URLs públicas https para auto-retorno y notificaciones (no sirven en localhost).
      ...(https ? { auto_return: "approved" as const, notification_url: `${origin}/api/mercadopago/webhook?b=${b.id}` } : {}),
      expires: true,
      expiration_date_to: new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString(),
      statement_descriptor: b.name.replace(/[^\w ]/g, "").slice(0, 22) || "TURNO",
      metadata: { appointmentId: appt.id, businessId: b.id },
    },
  });
  if (!pref.init_point || !pref.id) throw new Error("Mercado Pago no devolvió la URL de pago");
  return { url: pref.init_point, preferenceId: pref.id };
}

/** Libera los horarios retenidos cuyo plazo de pago venció. */
export async function expirePendingPayments(businessId?: string) {
  const cutoff = new Date(Date.now() - HOLD_MINUTES * 60_000);
  const rows = await prisma.appointment.findMany({
    where: { ...(businessId ? { businessId } : {}), status: "PENDING_PAYMENT", createdAt: { lt: cutoff } },
    select: { id: true },
  });
  if (rows.length === 0) return 0;
  const ids = rows.map((r) => r.id);
  await prisma.$transaction([
    prisma.appointment.updateMany({ where: { id: { in: ids }, status: "PENDING_PAYMENT" }, data: { status: "CANCELLED" } }),
    prisma.payment.updateMany({ where: { appointmentId: { in: ids }, state: "PENDING" }, data: { state: "CANCELLED" } }),
  ]);
  return ids.length;
}

export type MpInfo = { id: string; status: string; amount: number; externalRef: string };
export type ApplyResult = { appointmentId: string | null; confirmedNow: boolean; state: PaymentState | null };

const isOverlap = (e: unknown) => /appointment_no_overlap|23P01/.test(String((e as Error)?.message ?? e));

/**
 * Aplica el resultado de un pago de Mercado Pago a nuestra base. Idempotente: se puede llamar
 * N veces (webhook repetido, volver del checkout, reintentos) y el cobro se registra una sola vez.
 * Separada de la llamada a la API para poder probarla sin credenciales.
 */
export async function applyMpPayment(businessId: string, mp: MpInfo): Promise<ApplyResult> {
  // Se busca por (id, businessId): un pago de otra barbería jamás puede tocar este turno.
  const pay = await prisma.payment.findFirst({ where: { id: mp.externalRef, businessId } });
  if (!pay) return { appointmentId: null, confirmedNow: false, state: null };

  if (mp.status !== "approved") {
    const state: PaymentState = mp.status === "rejected" ? "REJECTED" : ["cancelled", "refunded", "charged_back"].includes(mp.status) ? "CANCELLED" : "PENDING";
    if (pay.state !== "APPROVED" && pay.state !== state) await prisma.payment.update({ where: { id: pay.id }, data: { state } });
    return { appointmentId: pay.appointmentId, confirmedNow: false, state: pay.state === "APPROVED" ? "APPROVED" : state };
  }

  if (pay.state === "APPROVED") return { appointmentId: pay.appointmentId, confirmedNow: false, state: "APPROVED" };

  // Defensa: el monto cobrado debe cubrir lo que esperábamos.
  if (Math.round(mp.amount * 100) < pay.amountCents) {
    await prisma.payment.update({ where: { id: pay.id }, data: { note: `Monto aprobado ($${mp.amount}) menor al esperado` } });
    return { appointmentId: pay.appointmentId, confirmedNow: false, state: pay.state };
  }

  // Si el horario ya se había liberado, intenta recuperarlo; si otro cliente lo tomó, deja constancia.
  let note: string | null = null;
  const appt = await prisma.appointment.findUniqueOrThrow({ where: { id: pay.appointmentId } });
  if (appt.status === "CANCELLED") {
    try {
      await prisma.appointment.update({ where: { id: appt.id }, data: { status: "PENDING_PAYMENT" } });
    } catch (e) {
      if (!isOverlap(e)) throw e;
      note = "Pago aprobado pero el horario ya fue tomado por otro cliente: reembolsar o reprogramar.";
    }
  }

  const result = await prisma.$transaction(
    async (tx) => {
      const claim = await tx.payment.updateMany({
        where: { id: pay.id, state: { not: "APPROVED" } },
        data: { state: "APPROVED", mpPaymentId: mp.id, note },
      });
      if (claim.count === 0) return { applied: false, confirmedNow: false };

      const paymentStatus = pay.kind === "FULL" ? ("PAID" as const) : ("DEPOSIT_PAID" as const);
      const moved = await tx.appointment.updateMany({
        where: { id: pay.appointmentId, status: "PENDING_PAYMENT" },
        data: { status: "CONFIRMED", paymentStatus, amountPaidCents: { increment: pay.amountCents } },
      });
      if (moved.count === 0) {
        const cur = await tx.appointment.findUniqueOrThrow({ where: { id: pay.appointmentId } });
        await tx.appointment.update({
          where: { id: cur.id },
          data: {
            amountPaidCents: { increment: pay.amountCents },
            paymentStatus: pay.kind === "FULL" ? "PAID" : cur.paymentStatus === "UNPAID" ? "DEPOSIT_PAID" : cur.paymentStatus,
          },
        });
      }
      return { applied: true, confirmedNow: moved.count === 1 };
    },
    { timeout: 20_000, maxWait: 10_000 },
  );

  if (result.confirmedNow) await enqueueBookingMessages(pay.appointmentId, pay.amountCents);
  return { appointmentId: pay.appointmentId, confirmedNow: result.confirmedNow, state: "APPROVED" };
}

/** Consulta el pago en Mercado Pago (con el token de ESA barbería) y lo aplica. */
export async function syncMpPayment(businessId: string, mpPaymentId: string): Promise<ApplyResult | null> {
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business?.mpAccessToken) return null;
  const mp = await new MPPayment(client(business)).get({ id: mpPaymentId });
  return applyMpPayment(business.id, {
    id: String(mp.id),
    status: mp.status ?? "",
    amount: Number(mp.transaction_amount ?? 0),
    externalRef: mp.external_reference ?? "",
  });
}
