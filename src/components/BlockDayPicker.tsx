"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { Icon } from "./ui/Icon";
import { createBlock, removeBlock } from "@/app/admin/schedule/block-actions";
import { blockKind, blockLabel } from "@/lib/blocks";

export type DayBlock = { id: string; barberId: string | null; startAt: string; endAt: string };

/**
 * «Tocá un horario para bloquearlo»: muestra los horarios que el profesional ofrece ese día; un toque lo bloquea (queda en rojo)
 * y otro toque lo desbloquea. No toca la configuración semanal: es solo una excepción para esa fecha.
 */
export function BlockDayPicker({ barberId, barberName, weekly, blocks, tz, today }: { barberId: string; barberName: string; weekly: Record<number, string[]>; blocks: DayBlock[]; tz: string; today: string }) {
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; conflict?: boolean } | null>(null);
  const [, start] = useTransition();

  const d = DateTime.fromISO(date, { zone: tz });
  const times = d.isValid ? (weekly[d.weekday % 7] ?? []) : [];
  const now = DateTime.now().setZone(tz);
  const shift = (n: number) => {
    const next = d.plus({ days: n }).toISODate()!;
    if (next >= today) {
      setDate(next);
      setMsg(null);
    }
  };

  const coverBy = (t: string) => {
    const ms = DateTime.fromISO(`${date}T${t}`, { zone: tz }).toMillis();
    return blocks.find((b) => (b.barberId === null || b.barberId === barberId) && new Date(b.startAt).getTime() <= ms && ms < new Date(b.endAt).getTime());
  };

  async function toggle(t: string) {
    const cover = coverBy(t);
    setMsg(null);
    setBusyKey(t);
    try {
      if (cover) {
        const s = new Date(cover.startAt);
        const e = new Date(cover.endAt);
        const single = blockKind(s, e, tz) === "slot";
        if (!single && !window.confirm(`Este horario está bloqueado por «${blockLabel(s, e, tz)}»${cover.barberId ? "" : " (todo el negocio)"}. ¿Quitar ese bloqueo?`)) return;
        await removeBlock(cover.id, "one");
      } else {
        const r = await createBlock({ barberId, dateFrom: date, allDay: false, timeFrom: t });
        if (!r.ok) {
          if (r.conflicts?.length) {
            const c = r.conflicts[0];
            if (window.confirm(`Hay un turno reservado a las ${t} (${c.customer} · ${c.service}). ¿Bloquear igual y mantener el turno?`)) {
              const r2 = await createBlock({ barberId, dateFrom: date, allDay: false, timeFrom: t }, Object.fromEntries(r.conflicts.map((x) => [x.id, { action: "keep" as const }])));
              if (!r2.ok) setMsg({ text: r2.error });
            } else setMsg({ text: "Para reprogramar o cancelar ese turno, hacelo desde Turnos y después bloqueá el horario.", conflict: true });
          } else setMsg({ text: r.error });
        }
      }
      start(() => router.refresh());
    } catch {
      setMsg({ text: "No se pudo guardar. Probá de nuevo." });
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="rounded-2xl border border-black/10 p-3.5">
      <h3 className="text-sm font-semibold">Bloquear con un toque</h3>
      <p className="mt-0.5 text-sm text-muted">Elegí el día y tocá un horario de {barberName}: queda en rojo y nadie puede reservarlo. Tocalo de nuevo para desbloquearlo.</p>

      <div className="mt-3 flex items-center gap-2">
        <button type="button" onClick={() => shift(-1)} disabled={date <= today} aria-label="Día anterior" className="btn-ghost !rounded-full !px-3 !py-1.5 disabled:opacity-40">
          ‹
        </button>
        <input type="date" value={date} min={today} onChange={(e) => e.target.value && (setDate(e.target.value), setMsg(null))} className="input min-w-0 flex-1" aria-label="Día" />
        <button type="button" onClick={() => shift(1)} aria-label="Día siguiente" className="btn-ghost !rounded-full !px-3 !py-1.5">
          ›
        </button>
      </div>
      {d.isValid && <div className="mt-2 text-sm font-medium first-letter:uppercase">{d.setLocale("es").toFormat("cccc d 'de' LLLL")}</div>}

      {times.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{barberName} no tiene horarios cargados ese día.</p>
      ) : (
        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6" role="group" aria-label="Horarios del día">
          {times.map((t) => {
            const blocked = !!coverBy(t);
            const past = DateTime.fromISO(`${date}T${t}`, { zone: tz }) <= now;
            return (
              <button
                key={t}
                type="button"
                disabled={past || busyKey === t}
                onClick={() => toggle(t)}
                aria-pressed={blocked}
                aria-label={`${t}${blocked ? ", bloqueado" : ""}`}
                className={`flex items-center justify-center gap-1 rounded-xl border px-1 py-2 text-sm font-semibold tabular-nums transition disabled:opacity-40 ${blocked ? "border-red-600 bg-red-500 text-white" : "border-black/15 bg-surface-muted hover:border-red-400"}`}
              >
                {blocked && <Icon name="lock" size={12} />}
                {t}
              </button>
            );
          })}
        </div>
      )}
      {msg && (
        <p className="mt-3 text-sm text-red-600" role="status">
          {msg.text} {msg.conflict && <Link href="/admin/turnos" className="underline">Ir a Turnos</Link>}
        </p>
      )}
    </div>
  );
}
