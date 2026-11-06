import { DateTime } from "luxon";
import { prisma } from "./db";
import { HOLD_MINUTES } from "./payment-math";

type Params = {
  businessId: string;
  barberId: string;
  serviceId: string;
  /** Fecha local del negocio, formato YYYY-MM-DD */
  date: string;
  /** Al reprogramar: el propio turno no cuenta como ocupado (así se puede mover unos minutos). */
  excludeAppointmentId?: string;
};

export type ScheduleMode = "AUTO" | "MANUAL";
type Range = readonly [startMs: number, endMs: number];

/**
 * Inicios de turno posibles (ms) dentro de las franjas de atención, sin tocar la base de datos (por eso se puede probar sola).
 *
 * - MANUAL: los inicios van cada `intervalMin` desde el comienzo de la franja, sin importar el servicio.
 * - AUTO: los inicios dependen de la duración del servicio. En cada tramo libre de la franja los turnos van uno a continuación
 *   del otro (un servicio de 45 min: 09:00, 09:45, 10:30…) y, si hay una reserva, la grilla sigue desde donde ella termina.
 *
 * En los dos modos el turno completo (inicio + duración real) tiene que entrar en la franja, no puede pisar reservas, bloqueos
 * ni horarios desactivados (`blocks`), y no puede empezar antes de `earliestMs`.
 */
export function generateStarts(p: { mode: ScheduleMode; intervalMin: number; durationMin: number; windows: Range[]; blocks: Range[]; earliestMs: number }): number[] {
  const dur = p.durationMin * 60_000;
  const out: number[] = [];
  if (!(dur > 0)) return out;
  const blocks = [...p.blocks].sort((a, b) => a[0] - b[0]);
  const free = (s: number) => !blocks.some(([bs, be]) => s < be && s + dur > bs);

  for (const [ws, we] of p.windows) {
    if (p.mode === "MANUAL") {
      const step = p.intervalMin * 60_000;
      if (!(step > 0)) continue;
      for (let s = ws; s + dur <= we; s += step) if (s >= p.earliestMs && free(s)) out.push(s);
      continue;
    }

    // AUTO: tramos libres de la franja (descontando reservas, bloqueos y horarios desactivados) y turnos seguidos en cada uno.
    let cursor = ws;
    const gaps: Range[] = [];
    for (const [bs, be] of blocks) {
      if (be <= cursor || bs >= we) continue;
      if (bs > cursor) gaps.push([cursor, bs]);
      cursor = Math.max(cursor, be);
    }
    if (cursor < we) gaps.push([cursor, we]);
    for (const [gs, ge] of gaps) for (let s = gs; s + dur <= ge; s += dur) if (s >= p.earliestMs) out.push(s);
  }
  return out;
}

/**
 * Devuelve los inicios de turno disponibles (ISO UTC) para un día.
 * Toda la aritmética de horarios se hace en la zona horaria del negocio.
 */
export async function getAvailableSlots({ businessId, barberId, serviceId, date, excludeAppointmentId }: Params): Promise<string[]> {
  const [business, service, barber] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId } }),
    prisma.service.findFirst({ where: { id: serviceId, businessId, active: true } }),
    prisma.barber.findFirst({ where: { id: barberId, businessId, active: true } }),
  ]);
  if (!business || !service || !barber) return [];

  const tz = business.timezone;
  const day = DateTime.fromISO(date, { zone: tz }).startOf("day");
  if (!day.isValid) return [];

  const now = DateTime.now().setZone(tz);
  if (day > now.plus({ days: business.maxAdvanceDays }).endOf("day")) return [];
  if (day < now.startOf("day")) return [];

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
      select: { startAt: true, endAt: true },
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

  // Reservas y bloqueos, más los horarios que el barbero desactivó a mano: una celda desactivada [c, c+intervalo) bloquea
  // cualquier servicio que la cruce, así un servicio largo no puede "pisar" un horario deshabilitado.
  const interval = business.slotIntervalMin;
  const blocks: Range[] = [
    ...[...busy, ...timeOffs].map((b) => [b.startAt.getTime(), b.endAt.getTime()] as const),
    ...disabledRows.map((d) => [day.plus({ minutes: d.startMin }).toMillis(), day.plus({ minutes: d.startMin + interval }).toMillis()] as const),
  ];

  const starts = generateStarts({
    mode: business.scheduleMode,
    intervalMin: interval,
    durationMin: service.durationMin,
    windows: hours.map((h) => [day.plus({ minutes: h.startMin }).toMillis(), day.plus({ minutes: h.endMin }).toMillis()] as const),
    blocks,
    earliestMs: now.plus({ minutes: business.minNoticeMin }).toMillis(),
  });
  return starts.map((ms) => DateTime.fromMillis(ms).toUTC().toISO()!);
}

/** Validación server-side de que un inicio concreto sigue siendo reservable. */
export async function isSlotAvailable(p: Omit<Params, "date"> & { startAt: Date }) {
  const business = await prisma.business.findUnique({ where: { id: p.businessId } });
  if (!business) return false;
  const date = DateTime.fromJSDate(p.startAt).setZone(business.timezone).toISODate()!;
  const slots = await getAvailableSlots({ ...p, date });
  return slots.some((s) => new Date(s).getTime() === p.startAt.getTime());
}
