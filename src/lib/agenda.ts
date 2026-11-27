import { DateTime } from "luxon";

/** Elemento de la agenda de un día: un turno, un hueco libre, un bloqueo o la línea de la hora actual. */
export type TimelineItem<A extends { startMs: number }, K extends { at: number } = { at: number }> =
  | { kind: "appt"; at: number; appt: A }
  | { kind: "free"; at: number; barberId: string }
  | { kind: "block"; at: number; block: K }
  | { kind: "now"; at: number };

/**
 * Junta turnos y huecos libres de un profesional (o de todos) en orden por horario. Si es hoy, intercala la línea «ahora»
 * antes del primer elemento que todavía no empezó. Los huecos libres que caen DENTRO de un turno del mismo profesional no se
 * muestran (el servidor ya los descarta; esto es una segunda defensa en pantalla).
 */
export function buildTimeline<A extends { startMs: number; endMs: number; barberId?: string | null }, K extends { at: number } = { at: number }>(
  appts: A[],
  free: { barberId: string; startMs: number }[],
  nowMs: number | null,
  blocks: K[] = [],
): TimelineItem<A, K>[] {
  const busy = (f: { barberId: string; startMs: number }) => appts.some((a) => (a.barberId ?? f.barberId) === f.barberId && f.startMs >= a.startMs && f.startMs < a.endMs);
  const rank = (k: string) => (k === "appt" ? 0 : k === "block" ? 1 : 2);
  const items: TimelineItem<A, K>[] = [
    ...appts.map((appt) => ({ kind: "appt" as const, at: appt.startMs, appt })),
    ...blocks.map((block) => ({ kind: "block" as const, at: block.at, block })),
    ...free.filter((f) => !busy(f)).map((f) => ({ kind: "free" as const, at: f.startMs, barberId: f.barberId })),
  ].sort((a, b) => a.at - b.at || rank(a.kind) - rank(b.kind));
  if (nowMs !== null) {
    const idx = items.findIndex((i) => i.at > nowMs);
    const marker: TimelineItem<A, K> = { kind: "now", at: nowMs };
    if (idx === -1) items.push(marker);
    else items.splice(idx, 0, marker);
  }
  return items;
}

/**
 * Los 7 días que muestra la agenda (YYYY-MM-DD, zona del negocio). Empiezan hoy o, si se navega a otra semana, en la fecha
 * pedida (`from`); nunca antes de hoy.
 */
export function agendaDays(tz: string, now: DateTime = DateTime.now(), from?: string | null): string[] {
  const today = now.setZone(tz).startOf("day");
  const f = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? DateTime.fromISO(from, { zone: tz }).startOf("day") : null;
  const t = f && f.isValid && f > today ? f : today;
  return Array.from({ length: 7 }, (_, i) => t.plus({ days: i }).toISODate()!);
}
