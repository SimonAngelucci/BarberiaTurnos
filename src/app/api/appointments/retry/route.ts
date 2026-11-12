import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifySignedId } from "@/lib/crypto";
import { createCheckout, payConfig, siteOrigin } from "@/lib/payments";

export const dynamic = "force-dynamic";

/** Máximo de cobros que se pueden generar para un mismo turno (evita retener un horario indefinidamente). */
const MAX_ATTEMPTS = 5;

const isOverlap = (e: unknown) => /appointment_no_overlap|23P01/.test(String((e as Error)?.message ?? e));
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/**
 * Reintentar el pago de un turno que quedó sin pagar (rechazado, abandonado o vencido).
 * Se autoriza con el mismo token firmado del link de retorno del checkout. Genera un cobro NUEVO con el
 * mismo monto y modalidad que el anterior, renueva la retención del horario y devuelve la URL de Mercado Pago.
 */
export async function POST(req: Request) {
  const parsed = z.object({ a: z.string().min(1), t: z.string().min(1) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success || !verifySignedId("appt", parsed.data.a, parsed.data.t)) return fail("No autorizado", 403);

  const appt = await prisma.appointment.findUnique({
    where: { id: parsed.data.a },
    include: { service: true, payments: { orderBy: { createdAt: "desc" } } },
  });
  if (!appt) return fail("Turno no encontrado", 404);

  const business = await prisma.business.findUnique({ where: { id: appt.businessId } }); // con token: solo se usa acá
  if (!business || !payConfig(business).enabled) return fail("Este negocio ya no acepta pagos online.", 400);

  if (appt.status !== "PENDING_PAYMENT" && appt.status !== "CANCELLED") return fail("Este turno ya está confirmado.", 409);
  if (appt.payments.some((p) => p.state === "APPROVED")) return fail("Este turno ya tiene un pago aprobado.", 409);
  if (!appt.barberId || appt.startAt.getTime() < Date.now()) return fail("Ese horario ya no está disponible. Elegí otro.", 409);
  const last = appt.payments[0];
  if (!last) return fail("Este turno no tiene un pago para reintentar.", 400);
  if (appt.payments.length >= MAX_ATTEMPTS) return fail("Llegaste al máximo de intentos de pago. Reservá de nuevo.", 429);

  // Renueva (o recupera, si ya había vencido) la retención del horario. Si otro cliente lo tomó, la base lo impide.
  try {
    await prisma.appointment.update({ where: { id: appt.id }, data: { status: "PENDING_PAYMENT", createdAt: new Date() } });
  } catch (e) {
    if (isOverlap(e)) return fail("Ese horario ya fue tomado por otro cliente. Elegí otro.", 409);
    console.error("retry hold", e);
    return fail("No se pudo reintentar. Probá de nuevo.", 500);
  }

  const [, pay] = await prisma.$transaction([
    prisma.payment.updateMany({ where: { appointmentId: appt.id, state: "PENDING" }, data: { state: "CANCELLED" } }),
    prisma.payment.create({ data: { businessId: appt.businessId, appointmentId: appt.id, kind: last.kind, amountCents: last.amountCents } }),
  ]);

  try {
    const co = await createCheckout(business, appt, pay, appt.service.name, siteOrigin(req));
    await prisma.payment.update({ where: { id: pay.id }, data: { mpPreferenceId: co.preferenceId } });
    return NextResponse.json({ checkoutUrl: co.url });
  } catch (e) {
    console.error("retry preference", e);
    await prisma.payment.update({ where: { id: pay.id }, data: { state: "CANCELLED" } });
    return fail("No pudimos iniciar el pago. Probá de nuevo en unos segundos.", 502);
  }
}
