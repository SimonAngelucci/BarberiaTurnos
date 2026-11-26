import { DateTime } from "luxon";

/** Elemento de la agenda de un día: un turno, un hueco libre o la línea de la hora actual. */
export type TimelineItem<A extends { startMs: number }> =
  | { kind: "appt"; at: number; appt: A }
  | { kind: "free"; at: number; barberId: string }
  | { kind: "now"; at: number };

/**
 * Junta turnos y huecos libres de un profesional (o de todos) en orden por horario. Si es hoy, intercala la línea «ahora»
 * antes del primer elemento que todavía no empezó. Los huecos libres que caen DENTRO de un turno del mismo profesional no se
 * muestran (el servidor ya los descarta; esto es una segunda defensa en pantalla).
 */
export function buildTimeline<A extends { startMs: number; endMs: number; barberId?: string | null }>(
  appts: A[],
  free: { barberId: string; startMs: number }[],
  nowMs: number | null,
): TimelineItem<A>[] {
  const busy = (f: { barberId: string; startMs: number }) => appts.some((a) => (a.barberId ?? f.barberId) === f.barberId && f.startMs >= a.startMs && f.startMs < a.endMs);
  const items: TimelineItem<A>[] = [
    ...appts.map((appt) => ({ kind: "appt" as const, at: appt.startMs, appt })),
    ...free.filter((f) => !busy(f)).map((f) => ({ kind: "free" as const, at: f.startMs, barberId: f.barberId })),
  ].sort((a, b) => a.at - b.at || (a.kind === "appt" ? -1 : 1));
  if (nowMs !== null) {
    const idx = items.findIndex((i) => i.at > nowMs);
    const marker: TimelineItem<A> = { kind: "now", at: nowMs };
    if (idx === -1) items.push(marker);
    else items.splice(idx, 0, marker);
  }
  return items;
}

/** Los 7 días que muestra la agenda (YYYY-MM-DD, zona del negocio), empezando hoy. */
export function agendaDays(tz: string, now: DateTime = DateTime.now()): string[] {
  const t = now.setZone(tz).startOf("day");
  return Array.from({ length: 7 }, (_, i) => t.plus({ days: i }).toISODate()!);
}
