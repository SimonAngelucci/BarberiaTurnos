import { DateTime } from "luxon";
import { prisma } from "./db";
import { HOLD_MINUTES } from "./payment-math";

type Params = {
  businessId: string;
  barberId: string;
  serviceId: string;
  /** Fecha local del negocio, formato YYYY-MM-DD */
  date: string;
  /** Al reprogramar: el propio turno no cuenta como ocupado. */
  excludeAppointmentId?: string;
};

/**
 * Horarios que el administrador cargó a mano para un día (TimeSlot), tal cual, sin recalcular nada.
 *
 * REGLA: si el administrador cargó un horario, se ofrece. No depende de la duración del servicio, de cuánto falta para el
 * turno siguiente ni de ningún intervalo. Solo se oculta cuando:
 *  - ya hay un turno activo del mismo profesional que empieza a esa MISMA hora (no se puede reservar dos veces el mismo horario);
 *  - cae dentro de un bloqueo de fechas cargado por el administrador (vacaciones, feriados…);
 *  - ya pasó, o no respeta el aviso mínimo que configuró el negocio.
 */
async function loadDay({ businessId, barberId, serviceId, date, excludeAppointmentId }: Params) {
  const [business, service, barber] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId } }),
    prisma.service.findFirst({ where: { id: serviceId, businessId, active: true, comingSoon: false } }),
    prisma.barber.findFirst({ where: { id: barberId, businessId, active: true } }),
  ]);
  if (!business || !service || !barber) return null;

  const tz = business.timezone;
  const day = DateTime.fromISO(date, { zone: tz }).startOf("day");
  if (!day.isValid) return null;

  const now = DateTime.now().setZone(tz);
  if (day > now.plus({ days: business.maxAdvanceDays }).endOf("day")) return null;
  if (day < now.startOf("day")) return null;

  const nextDay = day.plus({ days: 1 });
  const weekday = day.weekday % 7; // luxon: 1=lun..7=dom -> 0=dom..6=sáb

  const [slots, taken, timeOffs] = await Promise.all([
    prisma.timeSlot.findMany({ where: { barberId, weekday }, orderBy: { startMin: "asc" }, select: { startMin: true } }),
    prisma.appointment.findMany({
      where: {
        barberId,
        status: { not: "CANCELLED" },
        ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
        // Una reserva a la espera de pago que ya venció no ocupa el horario.
        NOT: { status: "PENDING_PAYMENT", createdAt: { lt: new Date(Date.now() - HOLD_MINUTES * 60_000) } },
        startAt: { gte: day.toJSDate(), lt: nextDay.toJSDate() },
      },
      select: { startAt: true },
    }),
    prisma.timeOff.findMany({
      where: {
        businessId,
        OR: [{ barberId }, { barberId: null }],
        startAt: { lt: nextDay.toJSDate() },
        endAt: { gt: day.toJSDate() },
      },
      select: { startAt: true, endAt: true },
    }),
  ]);

  const takenMs = new Set(taken.map((a) => a.startAt.getTime()));
  const earliestMs = now.plus({ minutes: business.minNoticeMin }).toMillis();
  const starts = slots
    .map((s) => day.plus({ minutes: s.startMin }).toMillis())
    .filter((ms) => ms >= earliestMs && !takenMs.has(ms) && !timeOffs.some((t) => ms >= t.startAt.getTime() && ms < t.endAt.getTime()));

  return { starts };
}

/** Horarios disponibles (ISO UTC) de un día: los que cargó el administrador, menos los ya reservados o bloqueados. */
export async function getAvailableSlots(p: Params): Promise<string[]> {
  const ctx = await loadDay(p);
  if (!ctx) return [];
  return ctx.starts.map((ms) => DateTime.fromMillis(ms).toUTC().toISO()!);
}

/**
 * Validación del servidor al reservar o reprogramar: el inicio tiene que ser uno de los horarios cargados y seguir libre.
 * La base de datos agrega una última defensa (índice único por profesional + hora de inicio) contra dos reservas simultáneas.
 */
export async function isSlotAvailable(p: Omit<Params, "date"> & { startAt: Date }) {
  const business = await prisma.business.findUnique({ where: { id: p.businessId }, select: { timezone: true } });
  if (!business) return false;
  const date = DateTime.fromJSDate(p.startAt).setZone(business.timezone).toISODate()!;
  const ctx = await loadDay({ ...p, date });
  return !!ctx && ctx.starts.includes(p.startAt.getTime());
}