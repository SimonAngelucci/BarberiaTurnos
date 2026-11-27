"use client";

import { useState } from "react";
import { DateTime } from "luxon";
import { Icon } from "./ui/Icon";
import { expandBlock } from "@/lib/blocks";
import { createBlock, moveOptions, type BlockInput, type BlockResult, type ConflictInfo, type Resolution } from "@/app/admin/schedule/block-actions";

export type BlockValues = { barberId: string | null; dateFrom: string; dateTo: string; allDay: boolean; timeFrom: string; timeTo: string; repeatUntil: string; reason: string };

const when = (iso: string, tz: string) => DateTime.fromISO(iso).setZone(tz).setLocale("es").toFormat("ccc d LLL · HH:mm");

/**
 * Formulario para bloquear horarios: un horario puntual, un rango de horas, un día, varios días seguidos, con repetición semanal
 * opcional, para un profesional o todo el negocio. Si ya hay turnos reservados NO los toca: muestra la lista y deja elegir
 * (mantener / reprogramar / cancelar y avisar) antes de bloquear. `tone="dark"` es para usarlo sobre fondo negro (agenda).
 */
export function BlockForm({
  barbers,
  tz,
  today,
  initial,
  replace,
  onDone,
  onCancel,
  tone = "page",
  submitLabel = "Bloquear",
}: {
  barbers: { id: string; name: string }[];
  tz: string;
  today: string;
  initial?: Partial<BlockValues>;
  /** Editar: el bloqueo (o la serie) que este reemplaza. */
  replace?: { id: string; scope: "one" | "series" };
  onDone: () => void;
  onCancel?: () => void;
  tone?: "page" | "dark";
  submitLabel?: string;
}) {
  const [v, setV] = useState<BlockValues>({ barberId: null, dateFrom: today, dateTo: "", allDay: false, timeFrom: "", timeTo: "", repeatUntil: "", reason: "", ...initial });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ConflictInfo[] | null>(null);
  const [res, setRes] = useState<Record<string, Pick>>({});
  const [opts, setOpts] = useState<Record<string, string[] | "loading">>({});

  const dark = tone === "dark";
  const input = dark ? "input !bg-ink-soft !text-white" : "input";
  const lab = dark ? "mb-1 block text-sm text-white/70" : "label";
  const set = <K extends keyof BlockValues>(k: K, val: BlockValues[K]) => setV((x) => ({ ...x, [k]: val }));
  const multiDay = !!v.dateTo && v.dateTo !== v.dateFrom;

  const input2: BlockInput = {
    barberId: v.barberId,
    dateFrom: v.dateFrom,
    dateTo: v.dateTo || null,
    allDay: v.allDay,
    timeFrom: v.allDay ? null : v.timeFrom || null,
    timeTo: v.allDay ? null : v.timeTo || null,
    repeatUntil: multiDay ? null : v.repeatUntil || null,
    reason: v.reason.trim() || null,
    replaceId: replace?.id ?? null,
    replaceScope: replace?.scope,
  };

  async function send(resolutions?: Record<string, Resolution>) {
    setBusy(true);
    setErr(null);
    const r = await createBlock(input2, resolutions).catch((): BlockResult => ({ ok: false, error: "No se pudo guardar el bloqueo. Intentá de nuevo." }));
    setBusy(false);
    if (r.ok) return onDone();
    if (r.conflicts?.length) {
      setConflicts(r.conflicts);
      setRes({});
      return;
    }
    setErr(r.error);
  }

  async function pickMove(c: ConflictInfo) {
    setRes((x) => ({ ...x, [c.id]: { action: "move", startAt: "" } }));
    if (opts[c.id]) return;
    setOpts((o) => ({ ...o, [c.id]: "loading" }));
    let ivs: { startAt: string; endAt: string }[] = [];
    try {
      ivs = expandBlock({ barberId: input2.barberId, dateFrom: input2.dateFrom, dateTo: input2.dateTo, allDay: input2.allDay, timeFrom: input2.timeFrom, timeTo: input2.timeTo, repeatUntil: input2.repeatUntil }, tz).map((i) => ({ startAt: i.startAt.toISOString(), endAt: i.endAt.toISOString() }));
    } catch {}
    const list = await moveOptions(c.id, ivs, input2.barberId).catch(() => []);
    setOpts((o) => ({ ...o, [c.id]: list }));
  }

  // ---- Aviso: ya hay turnos en ese horario
  if (conflicts) {
    return <ConflictPanel conflicts={conflicts} res={res} opts={opts} tz={tz} dark={dark} busy={busy} err={err} onSet={(id, r) => setRes((x) => ({ ...x, [id]: r }))} onMove={pickMove} onBack={() => setConflicts(null)} onConfirm={() => send(res as Record<string, Resolution>)} />;
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={lab}>Aplica a</label>
          <select className={input} value={v.barberId ?? ""} onChange={(e) => set("barberId", e.target.value || null)}>
            <option value="">Todo el negocio</option>
            {barbers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={lab}>Fecha</label>
          <input type="date" required min={today} className={input} value={v.dateFrom} onChange={(e) => set("dateFrom", e.target.value)} />
        </div>
        <div>
          <label className={lab}>Hasta (opcional, varios días)</label>
          <input type="date" min={v.dateFrom} className={input} value={v.dateTo} onChange={(e) => set("dateTo", e.target.value)} />
        </div>
      </div>

      <label className={`flex items-center gap-2 text-sm ${dark ? "text-white/90" : ""}`}>
        <input type="checkbox" checked={v.allDay} onChange={(e) => set("allDay", e.target.checked)} /> Todo el día
      </label>

      {!v.allDay && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lab}>Hora desde</label>
            <input type="time" required className={input} value={v.timeFrom} onChange={(e) => set("timeFrom", e.target.value)} />
          </div>
          <div>
            <label className={lab}>Hasta (opcional)</label>
            <input type="time" className={input} value={v.timeTo} onChange={(e) => set("timeTo", e.target.value)} />
          </div>
          <p className={`col-span-2 -mt-1 text-xs ${dark ? "text-white/55" : "text-muted"}`}>Si dejás «Hasta» vacío, se bloquea solo {v.timeFrom ? `el horario de las ${v.timeFrom}` : "ese horario"}. Con «Hasta» se bloquean todos los horarios que arrancan en ese rango.</p>
        </div>
      )}

      <div>
        <label className={lab}>Repetir cada semana hasta (opcional)</label>
        <input type="date" min={v.dateFrom} disabled={multiDay} className={`${input} disabled:opacity-50`} value={multiDay ? "" : v.repeatUntil} onChange={(e) => set("repeatUntil", e.target.value)} />
        <p className={`mt-1 text-xs ${dark ? "text-white/55" : "text-muted"}`}>Ej.: todos los miércoles de 13:00 a 14:00 hasta fin de mes. {multiDay ? "No se combina con varios días." : ""}</p>
      </div>

      <div>
        <label className={lab}>Motivo (opcional, solo lo ves vos)</label>
        <input className={input} maxLength={100} placeholder="Almuerzo, médico, vacaciones…" value={v.reason} onChange={(e) => set("reason", e.target.value)} />
      </div>

      {err && (
        <p role="alert" className="rounded-xl bg-red-500/15 p-2.5 text-sm text-red-400">
          {err}
        </p>
      )}
      <div className="flex gap-2">
        {onCancel && (
          <button type="button" className="btn-ghost flex-1 !rounded-full" onClick={onCancel}>
            Cancelar
          </button>
        )}
        <button className={`btn !rounded-full ${onCancel ? "flex-1" : ""}`} disabled={busy}>
          {busy ? "Guardando…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

type Pick = Resolution | { action: "move"; startAt: "" };

/** Aviso cuando ya hay turnos reservados en lo que se quiere bloquear: cada uno se mantiene, se reprograma o se cancela (avisando al cliente). */
export function ConflictPanel({ conflicts, res, opts, tz, dark, busy, err, onSet, onMove, onBack, onConfirm }: { conflicts: ConflictInfo[]; res: Record<string, Pick>; opts: Record<string, string[] | "loading">; tz: string; dark: boolean; busy: boolean; err: string | null; onSet: (id: string, r: Pick) => void; onMove: (c: ConflictInfo) => void; onBack: () => void; onConfirm: () => void }) {
  const input = dark ? "input !bg-ink-soft !text-white" : "input";
    const resolved = conflicts.every((c) => res[c.id] && (res[c.id].action !== "move" || (res[c.id] as { startAt: string }).startAt));
    const first = conflicts[0];
    const seg = (on: boolean) => `rounded-full px-3 py-1.5 text-xs font-semibold transition ${on ? "bg-primary text-on-primary" : dark ? "bg-ink-soft text-white/80" : "bg-surface-muted"}`;
    return (
      <div className="space-y-3" role="alertdialog" aria-label="Turnos en ese horario">
        <div className={`rounded-2xl p-3 text-sm ${dark ? "bg-amber-400/15 text-amber-200" : "bg-amber-50 text-amber-900"}`}>
          <Icon name="alert" size={16} className="mr-1.5 inline -translate-y-px" />
          {conflicts.length === 1 ? (
            <>
              Este horario tiene un turno de <strong>{first.customer}</strong> ({first.service}). ¿Qué querés hacer?
            </>
          ) : (
            <>Hay <strong>{conflicts.length} turnos</strong> reservados en ese horario. Elegí qué hacer con cada uno.</>
          )}
          <p className="mt-1 text-xs opacity-80">No se cancela nada solo: el turno sigue como está hasta que elijas.</p>
        </div>
        <ul className="space-y-3">
          {conflicts.map((c) => {
            const r = res[c.id];
            const o = opts[c.id];
            return (
              <li key={c.id} className={`space-y-2 rounded-2xl border p-3 ${dark ? "border-ink-line" : "border-black/10"}`}>
                <div className="text-sm">
                  <strong>{c.customer}</strong> · {c.service}
                  <div className={`text-xs ${dark ? "text-white/60" : "text-muted"}`}>
                    {when(c.startAt, tz)}
                    {c.barberName ? ` · ${c.barberName}` : ""}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2" role="group" aria-label={`Qué hacer con el turno de ${c.customer}`}>
                  <button type="button" className={seg(r?.action === "keep")} onClick={() => onSet(c.id, { action: "keep" })}>
                    Bloquear igual (mantener el turno)
                  </button>
                  <button type="button" className={seg(r?.action === "move")} onClick={() => onMove(c)}>
                    Reprogramar turno
                  </button>
                  <button type="button" className={seg(r?.action === "cancel")} onClick={() => onSet(c.id, { action: "cancel" })}>
                    Cancelar turno y avisar al cliente
                  </button>
                </div>
                {r?.action === "move" && (
                  <div>
                    {o === "loading" || !o ? (
                      <p className="text-xs opacity-70">Buscando horarios libres…</p>
                    ) : o.length === 0 ? (
                      <p className="text-xs text-red-400">No hay horarios libres para reprogramarlo en los próximos días.</p>
                    ) : (
                      <select className={input} value={(r as { startAt: string }).startAt} onChange={(e) => onSet(c.id, { action: "move", startAt: e.target.value })} aria-label="Nuevo horario">
                        <option value="">Elegí el nuevo horario…</option>
                        {o.map((s) => (
                          <option key={s} value={s}>
                            {when(s, tz)}
                          </option>
                        ))}
                      </select>
                    )}
                    <p className="mt-1 text-xs opacity-70">Al cliente le avisamos el cambio por WhatsApp.</p>
                  </div>
                )}
                {r?.action === "cancel" && <p className="text-xs opacity-70">El turno se cancela y el cliente recibe el aviso por WhatsApp (si está activado).</p>}
              </li>
            );
          })}
        </ul>
        {err && (
          <p role="alert" className="rounded-xl bg-red-500/15 p-2.5 text-sm text-red-400">
            {err}
          </p>
        )}
        <div className="flex gap-2">
          <button type="button" className="btn-ghost flex-1 !rounded-full" onClick={onBack}>
            Volver
          </button>
          <button type="button" className="btn flex-1 !rounded-full" disabled={!resolved || busy} onClick={onConfirm}>
            {busy ? "Guardando…" : "Confirmar y bloquear"}
          </button>
        </div>
      </div>
    );
}
