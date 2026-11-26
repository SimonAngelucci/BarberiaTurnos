import { DateTime } from "luxon";

/**
 * Lógica pura (sin base de datos ni React) del selector de día y de los horarios de un día, para poder probarla.
 * Todo se calcula en la zona horaria del NEGOCIO: a las 22:30 en Argentina (UTC−3) en UTC ya es «mañana».
 */

/** Hoy en la zona del negocio, formato YYYY-MM-DD. */
export function todayIso(timezone: string, now: DateTime = DateTime.now()): string {
  return now.setZone(timezone).toISODate()!;
}

/** Días ofrecidos para reservar: hoy y los siguientes (tope 30), en la zona del negocio. */
export function bookableDays(timezone: string, maxAdvanceDays: number, now: DateTime = DateTime.now()): DateTime[] {
  const today = now.setZone(timezone).startOf("day");
  return Array.from({ length: Math.min(maxAdvanceDays, 30) + 1 }, (_, i) => today.plus({ days: i }));
}

/**
 * Inicios (ms) que se ofrecen en un día: los horarios cargados por el administrador menos los ya pasados (o que no respetan el
 * aviso mínimo), los ya reservados y los bloqueados. Es la misma regla que usa el servidor en `lib/slots.ts`.
 */
export function computeStarts(p: {
  day: DateTime;
  slotMins: number[];
  now: DateTime;
  minNoticeMin: number;
  takenMs?: Set<number>;
  timeOffs?: { startAt: Date; endAt: Date }[];
}): number[] {
  const earliestMs = p.now.plus({ minutes: p.minNoticeMin }).toMillis();
  const taken = p.takenMs ?? new Set<number>();
  const offs = p.timeOffs ?? [];
  return p.slotMins
    .map((m) => p.day.plus({ minutes: m }).toMillis())
    .filter((ms) => ms >= earliestMs && !taken.has(ms) && !offs.some((t) => ms >= t.startAt.getTime() && ms < t.endAt.getTime()));
}

/** Primer día, después de `fromIso`, que tenga horarios. `fetchSlots` devuelve los horarios de un día. Mira como mucho `maxDays`. */
export async function findNextAvailableDay(days: string[], fromIso: string, fetchSlots: (iso: string) => Promise<string[]>, maxDays = 14): Promise<string | null> {
  const start = days.indexOf(fromIso);
  for (const iso of days.slice(start + 1, start + 1 + maxDays)) {
    if ((await fetchSlots(iso)).length > 0) return iso;
  }
  return null;
}
