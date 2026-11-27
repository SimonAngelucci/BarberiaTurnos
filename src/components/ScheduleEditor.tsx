"use client";

import { Icon } from "@/components/ui/Icon";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { hhmmToMin, minToHHMM } from "@/lib/format";
import { coverOf, nextDateFor, toggleSlotBlock, type DayBlock } from "./blockToggle";

export type DayTimes = { wd: number; label: string; times: string[] };
type Lock = { dateFor: (t: string) => string; blocked: (t: string) => boolean; busy: string | null; onToggle: (t: string) => void };

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const clean = (list: string[]) => [...new Set(list.filter((t) => HHMM.test(t)))].sort();

/**
 * Editor de horarios cargados a mano. Cada horario de la lista es exactamente una hora que el cliente va a poder elegir:
 * se pueden agregar tantos como se quiera, cambiar uno por uno, quitar y repetir de un día a otro. No hay intervalos
 * obligatorios ni relación con la duración de los servicios.
 */
export function ScheduleEditor({ initial, barberId, blocks = [], tz }: { initial: DayTimes[]; barberId?: string; blocks?: DayBlock[]; tz?: string }) {
  const router = useRouter();
  const [days, setDays] = useState(() => initial.map((d) => ({ ...d, times: clean(d.times) })));
  const [all, setAll] = useState("09:00");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startT] = useTransition();

  // Bloqueo de un toque: solo la PRÓXIMA fecha de ese día de la semana; la configuración semanal no cambia.
  const lockFor = (wd: number): Lock | undefined =>
    barberId && tz
      ? {
          dateFor: (t) => nextDateFor(wd, t, tz),
          blocked: (t) => HHMM.test(t) && !!coverOf(blocks, barberId, nextDateFor(wd, t, tz), t, tz),
          busy,
          onToggle: async (t) => {
            if (!HHMM.test(t)) return;
            setBusy(`${wd}-${t}`);
            try {
              const r = await toggleSlotBlock({ barberId, date: nextDateFor(wd, t, tz), time: t, blocks, tz });
              if (r.error) say(r.error);
              startT(() => router.refresh());
            } catch {
              say("No se pudo guardar el bloqueo. Probá de nuevo.");
            } finally {
              setBusy(null);
            }
          },
        }
      : undefined;

  const say = (m: string) => {
    setNotice(m);
    setTimeout(() => setNotice(null), 3500);
  };

  const update = (wd: number, f: (t: string[]) => string[]) => setDays((ds) => ds.map((d) => (d.wd === wd ? { ...d, times: f(d.times) } : d)));
  const add = (wd: number, time: string) => {
    if (!HHMM.test(time)) return say("Elegí una hora válida.");
    update(wd, (t) => (t.includes(time) ? t : clean([...t, time])));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
        <p className="mb-2 text-sm font-medium">Agregar un horario a todos los días</p>
        <div className="flex flex-wrap items-center gap-2">
          <input type="time" aria-label="Hora" value={all} onChange={(e) => setAll(e.target.value)} className="input !w-32" />
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              if (!HHMM.test(all)) return say("Elegí una hora válida.");
              setDays((ds) => ds.map((d) => ({ ...d, times: d.times.includes(all) ? d.times : clean([...d.times, all]) })));
              say(`${all} agregado a todos los días`);
            }}
          >
            Agregar a todos
          </button>
        </div>
      </div>

      {notice && (
        <p role="status" className="rounded-lg bg-neutral-900 px-3 py-2 text-sm text-white">
          {notice}
        </p>
      )}

      {days.map((d) => (
        <DayCard key={d.wd} d={d} lock={lockFor(d.wd)} onAdd={(t) => add(d.wd, t)} onChange={(f) => update(d.wd, f)} onCopyAll={() => {
          setDays((ds) => ds.map((x) => ({ ...x, times: [...d.times] })));
          say(`Horarios del ${d.label.toLowerCase()} copiados a todos los días`);
        }} />
      ))}

      <p className="text-xs text-neutral-500">
        Los horarios que cargues son exactamente los que ven tus clientes: no dependen de la duración de los servicios ni de los turnos vecinos. Un horario solo se oculta si ya tiene un
        turno reservado a esa misma hora, si ese día está bloqueado o si ya pasó. Un día sin horarios no recibe turnos. Acordate de guardar.
      </p>
    </div>
  );
}

function DayCard({ d, lock, onAdd, onChange, onCopyAll }: { d: DayTimes; lock?: Lock; onAdd: (t: string) => void; onChange: (f: (t: string[]) => string[]) => void; onCopyAll: () => void }) {
  const [draft, setDraft] = useState("09:00");
  const [series, setSeries] = useState({ from: "09:00", to: "18:00", every: "30" });
  const [msg, setMsg] = useState<string | null>(null);

  function addSeries() {
    const from = HHMM.test(series.from) ? hhmmToMin(series.from) : NaN;
    const to = HHMM.test(series.to) ? hhmmToMin(series.to) : NaN;
    const every = Number(series.every);
    if (!(from <= to) || !Number.isInteger(every) || every < 1) return setMsg("Revisá desde, hasta y cada cuántos minutos.");
    const made: string[] = [];
    for (let m = from; m <= to && made.length < 500; m += every) made.push(minToHHMM(m));
    onChange((t) => clean([...t, ...made]));
    setMsg(`${made.length} horarios agregados`);
  }

  return (
    <section className="rounded-xl border border-neutral-200 p-3" aria-label={d.label}>
      <input type="hidden" name={`times_${d.wd}`} value={clean(d.times).join(",")} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{d.label}</h3>
        <span className="text-xs text-neutral-500">{d.times.length === 0 ? "Sin turnos" : `${clean(d.times).length} ${clean(d.times).length === 1 ? "horario" : "horarios"}`}</span>
      </div>

      {d.times.length > 0 && lock && (
        <p className="mt-2 text-xs text-neutral-500">
          Tocá el candado de un horario para bloquearlo solo el próximo {d.label.toLowerCase()} (queda en rojo). La semana siguiente vuelve a estar disponible; tocalo de nuevo para desbloquearlo.
        </p>
      )}
      {d.times.length > 0 && (
        <ul className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4 md:grid-cols-6">
          {d.times.map((t, i) => {
            const blocked = !!lock?.blocked(t);
            const when = lock && HHMM.test(t) ? DateTime.fromISO(lock.dateFor(t)).setLocale("es").toFormat("cccc d/MM") : "";
            return (
              <li key={i} className={`flex items-center overflow-hidden rounded-lg border ${blocked ? "border-red-600 bg-red-500 text-white" : "border-neutral-300 bg-white"}`}>
                <input
                  type="time"
                  aria-label={`Horario ${i + 1} del ${d.label}${blocked ? ", bloqueado" : ""}`}
                  value={t}
                  onChange={(e) => onChange((list) => list.map((x, j) => (j === i ? e.target.value : x)))}
                  onBlur={() => onChange((list) => clean(list))}
                  className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-sm tabular-nums outline-none"
                />
                {lock && (
                  <button
                    type="button"
                    disabled={!HHMM.test(t) || lock.busy === `${d.wd}-${t}`}
                    aria-pressed={blocked}
                    aria-label={blocked ? `Desbloquear ${t} del ${when}` : `Bloquear ${t} del ${when}`}
                    title={blocked ? `Bloqueado el ${when}. Tocá para desbloquear` : `Bloquear solo el ${when}`}
                    onClick={() => lock.onToggle(t)}
                    className={`px-2 py-1.5 disabled:opacity-40 ${blocked ? "text-white" : "text-neutral-400 hover:bg-red-50 hover:text-red-600"}`}
                  >
                    <Icon name="lock" size={14} />
                  </button>
                )}
                <button type="button" aria-label={`Quitar ${t || "horario"}`} onClick={() => onChange((list) => list.filter((_, j) => j !== i))} className={`px-2 py-1.5 ${blocked ? "text-white/80" : "text-neutral-400 hover:bg-red-50 hover:text-red-600"}`}>
                  <Icon name="x" size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="time"
          aria-label={`Nuevo horario del ${d.label}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault(); // Enter agrega el horario (no envía el formulario)
              onAdd(draft);
            }
          }}
          className="input !w-32"
        />
        <button type="button" className="btn-ghost" onClick={() => onAdd(draft)}>
          + Agregar horario
        </button>
        {d.times.length > 0 && (
          <>
            <button type="button" className="btn-ghost" onClick={onCopyAll}>
              Copiar a todos los días
            </button>
            <button type="button" className="px-2 py-1 text-sm text-red-600 underline" onClick={() => onChange(() => [])}>
              Vaciar día
            </button>
          </>
        )}
      </div>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer select-none text-neutral-600">Agregar varios de una vez</summary>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span>Desde</span>
          <input type="time" aria-label="Desde" value={series.from} onChange={(e) => setSeries({ ...series, from: e.target.value })} className="input !w-28" />
          <span>hasta</span>
          <input type="time" aria-label="Hasta" value={series.to} onChange={(e) => setSeries({ ...series, to: e.target.value })} className="input !w-28" />
          <span>cada</span>
          <input type="number" aria-label="Minutos" min={1} value={series.every} onChange={(e) => setSeries({ ...series, every: e.target.value })} className="input !w-20" />
          <span>min</span>
          <button type="button" className="btn-ghost" onClick={addSeries}>
            Agregar
          </button>
        </div>
        <p className="mt-1 text-xs text-neutral-500">Se suman a los que ya tenés; después podés cambiar, quitar o agregar cualquiera a mano.{msg ? ` · ${msg}` : ""}</p>
      </details>
    </section>
  );
}
