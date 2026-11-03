import { NextResponse, after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { claimBody, ensureChangeable, fail, findByClaim } from "@/lib/claim-api";
import { buildRescheduleOps, dispatchDue } from "@/lib/outbox";
import { isSlotAvailable } from "@/lib/slots";

export const dynamic = "force-dynamic";

const isOverlap = (e: unknown) => /appointment_no_overlap|23P01/.test(String((e as Error)?.message ?? e));

/**
 * Reprograma el turno con el código de reclamo. Mantiene barbero y servicio.
 * Valida plazo, disponibilidad real (sin contar el propio turno) y aplica todo junto: nuevo horario,
 * historial, recordatorios viejos salteados, aviso de reprogramación y recordatorios nuevos.
 */
export async function POST(req: Request) {
  const parsed = claimBody.extend({ startAt: z.string().datetime() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Datos inválidos.", 400);

  const found = await findByClaim(req, parsed.data.slug, parsed.data.code);
  if ("response" in found) return found.response;
  const { business, appt } = found;

  const ok = ensureChangeable(business, appt);
  if ("response" in ok) return ok.response;
  if (!appt.barberId) return fail("El barbero de este turno ya no está disponible. Comunicate con la barbería.", 409);

  const newStart = new Date(parsed.data.startAt);
  if (newStart.getTime() === appt.startAt.getTime()) return fail("Elegí un horario distinto al actual.", 400);

  const available = await isSlotAvailable({ businessId: business.id, barberId: appt.barberId, serviceId: appt.serviceId, startAt: newStart, excludeAppointmentId: appt.id });
  if (!available) return fail("Ese horario ya no está disponible. Elegí otro.", 409);

  const newEnd = new Date(newStart.getTime() + appt.service.durationMin * 60_000);
  try {
    await prisma.$transaction([
      // El filtro por estado evita pisar un turno cancelado/modificado en paralelo.
      prisma.appointment.update({ where: { id: appt.id, status: "CONFIRMED" }, data: { startAt: newStart, endAt: newEnd } }),
      prisma.appointmentEvent.create({
        data: { businessId: business.id, appointmentId: appt.id, kind: "RESCHEDULED", actor: "CLIENT", fromStartAt: appt.startAt, toStartAt: newStart },
      }),
      ...(await buildRescheduleOps(appt.id, newStart, newEnd)),
    ]);
  } catch (e) {
    // La restricción de la base impide el solapamiento aunque dos clientes elijan el mismo horario a la vez.
    if (isOverlap(e)) return fail("Alguien acaba de reservar ese horario. Elegí otro.", 409);
    if ((e as { code?: string })?.code === "P2025") return fail("Este turno cambió mientras lo modificabas. Volvé a ingresar tu código.", 409);
    console.error("reschedule", e);
    return fail("No pudimos reprogramar el turno. Intentá de nuevo.", 500);
  }

  after(() => dispatchDue().catch(console.error));
  return NextResponse.json({ ok: true, startAt: newStart.toISOString() });
}
