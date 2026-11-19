import { DateTime } from "luxon";
import { prisma } from "./db";
import { HOLD_MINUTES } from "./payment-math";
import { generateStarts, type Range, type ScheduleMode } from "./slot-gen";

// Se reexportan para no cambiar los imports que ya existían.
export { generateStarts };
export type { ScheduleMode };

type Params = {
  businessId: string;
  barberId: string;
  serviceId: string;
  /** Fecha local del negocio, formato YYYY-MM-DD */
  date: string;
  /** Al reprogramar: el propio turno no cuenta como ocupado (así se puede mover unos minutos). */
  excludeAppointmentId?: string;
  /** Duración a reservar si no es la normal del servicio (tiempo aprendido del cliente, o el largo de un turno que se mueve). */
  durationMin?: number;
};

/**
 * Margen para confirmar un horario que el cliente vio un rato antes: como la grilla se realinea después de cada reserva,
 * si otra persona reservó en el medio el horario elegido puede dejar de ser uno de los «ofrecidos» sin estar ocupado.
 * Mientras no pise nada, se acepta si era válido sin contar las reservas hechas en los últimos minutos.
 */
const GRACE_MS = 15 * 60_000;

/** Todo lo que hace falta para calcular los horarios de un día (se lee de la base una sola vez). */
async function loadDay({ businessId, barberId, serviceId, date, excludeAppointmentId, durationMin }: Params) {
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

  const [hours, disabledRows, busy, timeOffs] = await Promise.all([
    prisma.workingHour.findMany({ where: { barberId, weekday }, orderBy: { startMin: "asc" } }),
    prisma.disabledSlot.findMany({ where: { barberId, weekday }, select: { startMin: true } }),
    prisma.appointment.findMany({
      where: {
        barberId,
        status: { not: "CANCELLED" },
        ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
        // Una reserva a la espera de pago que ya venció no ocupa el horario.
        NOT: { status: "PENDING_PAYMENT", createdAt: { lt: new Date(Date.now() - HOLD_MINUTES * 60_000) } },
        startAt: { lt: nextDay.toJSDate() },
        endAt: { gt: day.toJSDate() },
      },
      select: { startAt: true, endAt: true, createdAt: true },
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

  // Bloqueos de fechas y horarios que el administrador desactivó a mano: una celda desactivada [c, c+intervalo) bloquea
  // cualquier servicio que la cruce, así un servicio largo no puede "pisar" un horario deshabilitado.
  const interval = business.slotIntervalMin;
  const fixed: Range[] = [
    ...timeOffs.map((b) => [b.startAt.getTime(), b.endAt.getTime()] as const),
    ...disabledRows.map((d) => [day.plus({ minutes: d.startMin }).toMillis(), day.plus({ minutes: d.startMin + interval }).toMillis()] as const),
  ];

  return {
    mode: business.scheduleMode,
    interval,
    durationMin: durationMin ?? service.durationMin,
    windows: hours.map((h) => [day.plus({ minutes: h.startMin }).toMillis(), day.plus({ minutes: h.endMin }).toMillis()] as const),
    earliestMs: now.plus({ minutes: business.minNoticeMin }).toMillis(),
    fixed,
    busy: busy.map((b) => ({ range: [b.startAt.getTime(), b.endAt.getTime()] as const, createdMs: b.createdAt.getTime() })),
  };
}

type DayCtx = NonNullable<Awaited<ReturnType<typeof loadDay>>>;

/** Inicios (ms) del día; `ignoreBookedSince` deja afuera las reservas hechas desde ese instante (para el margen de confirmación). */
function startsFor(c: DayCtx, ignoreBookedSince?: number): number[] {
  const booked = c.busy.filter((b) => ignoreBookedSince === undefined || b.createdMs < ignoreBookedSince).map((b) => b.range);
  return generateStarts({
    mode: c.mode,
    intervalMin: c.interval,
    durationMin: c.durationMin,
    windows: c.windows,
    blocks: [...booked, ...c.fixed],
    earliestMs: c.earliestMs,
  });
}

/**
 * Devuelve los inicios de turno disponibles (ISO UTC) para un día.
 * Toda la aritmética de horarios se hace en la zona horaria del negocio. Ver generateStarts para la regla de cada modo.
 */
export async function getAvailableSlots(p: Params): Promise<string[]> {
  const ctx = await loadDay(p);
  if (!ctx) return [];
  return startsFor(ctx).map((ms) => DateTime.fromMillis(ms).toUTC().toISO()!);
}

/**
 * Validación server-side de que un inicio concreto sigue siendo reservable (al reservar y al reprogramar).
 * 1) Es uno de los horarios que se ofrecen hoy; o
 * 2) lo era un momento antes (sin contar las reservas de los últimos minutos) y no pisa ninguna reserva, bloqueo ni horario
 *    desactivado: así una reserva ajena hecha mientras el cliente elegía no le «rompe» un horario que sigue libre.
 * La restricción de la base de datos (appointment_no_overlap) es la última defensa contra solapamientos.
 */
export async function isSlotAvailable(p: Omit<Params, "date"> & { startAt: Date }) {
  const business = await prisma.business.findUnique({ where: { id: p.businessId }, select: { timezone: true } });
  if (!business) return false;
  const date = DateTime.fromJSDate(p.startAt).setZone(business.timezone).toISODate()!;
  const ctx = await loadDay({ ...p, date });
  if (!ctx) return false;

  const start = p.startAt.getTime();
  if (startsFor(ctx).includes(start)) return true;

  const end = start + ctx.durationMin * 60_000;
  const overlaps = [...ctx.busy.map((b) => b.range), ...ctx.fixed].some(([bs, be]) => start < be && end > bs);
  return !overlaps && startsFor(ctx, Date.now() - GRACE_MS).includes(start);
}