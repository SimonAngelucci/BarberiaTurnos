import { DateTime } from "luxon";
import { prisma } from "./db";

type Params = {
  businessId: string;
  barberId: string;
  serviceId: string;
  /** Fecha local del negocio, formato YYYY-MM-DD */
  date: string;
};

/**
 * Devuelve los inicios de turno disponibles (ISO UTC) para un día.
 * Toda la aritmética de horarios se hace en la zona horaria del negocio.
 */
export async function getAvailableSlots({ businessId, barberId, serviceId, date }: Params): Promise<string[]> {
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

  const [hours, busy, timeOffs] = await Promise.all([
    prisma.workingHour.findMany({ where: { barberId, weekday }, orderBy: { startMin: "asc" } }),
    prisma.appointment.findMany({
      where: {
        barberId,
        status: { not: "CANCELLED" },
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

  const blocks = [...busy, ...timeOffs].map((b) => [b.startAt.getTime(), b.endAt.getTime()] as const);
  const earliest = now.plus({ minutes: business.minNoticeMin }).toMillis();
  const slots: string[] = [];

  for (const h of hours) {
    for (let m = h.startMin; m + service.durationMin <= h.endMin; m += business.slotIntervalMin) {
      const start = day.plus({ minutes: m });
      const end = start.plus({ minutes: service.durationMin });
      const s = start.toMillis();
      const e = end.toMillis();
      if (s < earliest) continue;
      if (blocks.some(([bs, be]) => s < be && e > bs)) continue;
      slots.push(start.toUTC().toISO()!);
    }
  }
  return slots;
}

/** Validación server-side de que un inicio concreto sigue siendo reservable. */
export async function isSlotAvailable(p: Omit<Params, "date"> & { startAt: Date }) {
  const business = await prisma.business.findUnique({ where: { id: p.businessId } });
  if (!business) return false;
  const date = DateTime.fromJSDate(p.startAt).setZone(business.timezone).toISODate()!;
  const slots = await getAvailableSlots({ ...p, date });
  return slots.some((s) => new Date(s).getTime() === p.startAt.getTime());
}
