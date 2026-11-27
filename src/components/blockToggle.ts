import { DateTime } from "luxon";
import { createBlock, removeBlock } from "@/app/admin/schedule/block-actions";
import { blockKind, blockLabel } from "@/lib/blocks";

export type DayBlock = { id: string; barberId: string | null; startAt: string; endAt: string };
export type ToggleResult = { error?: string; conflict?: boolean };

/** Bloqueo (de este profesional o de todo el negocio) que cubre ese horario de esa fecha, si hay. */
export function coverOf(blocks: DayBlock[], barberId: string, date: string, time: string, tz: string) {
  const ms = DateTime.fromISO(`${date}T${time}`, { zone: tz }).toMillis();
  return blocks.find((b) => (b.barberId === null || b.barberId === barberId) && new Date(b.startAt).getTime() <= ms && ms < new Date(b.endAt).getTime());
}

/** Próxima fecha (yyyy-MM-dd) en que ese día de la semana tiene ese horario todavía por delante. */
export function nextDateFor(weekday: number, time: string, tz: string, now: DateTime = DateTime.now().setZone(tz)) {
  const ahead = (weekday - (now.weekday % 7) + 7) % 7;
  let d = now.startOf("day").plus({ days: ahead });
  if (DateTime.fromISO(`${d.toISODate()}T${time}`, { zone: tz }) <= now) d = d.plus({ days: 7 });
  return d.toISODate()!;
}

/** Un toque: bloquea ese horario de esa fecha, o lo desbloquea si ya estaba bloqueado. Solo esa fecha: no toca la configuración semanal. */
export async function toggleSlotBlock(p: { barberId: string; date: string; time: string; blocks: DayBlock[]; tz: string }): Promise<ToggleResult> {
  const cover = coverOf(p.blocks, p.barberId, p.date, p.time, p.tz);
  if (cover) {
    const s = new Date(cover.startAt);
    const e = new Date(cover.endAt);
    if (blockKind(s, e, p.tz) !== "slot" && !window.confirm(`Este horario está bloqueado por «${blockLabel(s, e, p.tz)}»${cover.barberId ? "" : " (todo el negocio)"}. ¿Quitar ese bloqueo?`)) return {};
    await removeBlock(cover.id, "one");
    return {};
  }
  const input = { barberId: p.barberId, dateFrom: p.date, allDay: false, timeFrom: p.time };
  const r = await createBlock(input);
  if (r.ok) return {};
  if (!r.conflicts?.length) return { error: r.error };
  const c = r.conflicts[0];
  if (!window.confirm(`Hay un turno reservado a las ${p.time} (${c.customer} · ${c.service}). ¿Bloquear igual y mantener el turno?`)) {
    return { error: "Para reprogramar o cancelar ese turno, hacelo desde Turnos y después bloqueá el horario.", conflict: true };
  }
  const r2 = await createBlock(input, Object.fromEntries(r.conflicts.map((x) => [x.id, { action: "keep" as const }])));
  return r2.ok ? {} : { error: r2.error };
}
