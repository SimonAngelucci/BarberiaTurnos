"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { minToHHMM, hhmmToMin } from "@/lib/format";
import { gridCells } from "@/lib/schedule-grid";
import { generateStarts, type ScheduleMode } from "@/lib/slot-gen";

export type DayState = { wd: number; label: string; open: boolean; start: string; end: string; off: number[] };
type Svc = { id: string; name: string; durationMin: number };

const SHORT: Record<number, string> = { 1: "Lun", 2: "Mar", 3: "Mié", 4: "Jue", 5: "Vie", 6: "Sáb", 0: "Dom" };
const PREVIEW_MAX = 30;

/**
 * Editor semanal de horarios.
 *
 * - El primer turno de cada día es EXACTAMENTE la hora de apertura que se escribe (04:00, 09:10…); los siguientes van cada
 *   «intervalo» a partir de ahí. Nada obliga a empezar en múltiplos del intervalo.
 * - Cada celda se activa o desactiva con un toque, o pasando el dedo/mouse por varias («pintar»).
 * - «Todos los días»: un solo horario y una sola grilla para toda la semana (cada día se puede abrir o cerrar aparte).
 * - Debajo de cada grilla se muestra, con la misma regla que usa la página pública, qué horarios va a ver el cliente.
 */
export function WeekScheduleEditor({ initial, interval, mode, services }: { initial: DayState[]; interval: number; mode: ScheduleMode; services: Svc[] }) {
  const [days, setDays] = useState(initial);
  const [allDays, setAllDays] = useState(false);
  const [svcId, setSvcId] = useState(services[0]?.id ?? "");
  const svc = services.find((s) => s.id === svcId) ?? services[0];
  // Pintando: el valor que se aplica a las celdas que se vayan tocando (true = desactivar) y el día en que empezó.
  const paint = useRef<{ wd: number; off: boolean } | null>(null);
  const allRef = useRef(allDays);
  allRef.current = allDays;

  // En «todos los días» los cambios de horario y de grilla se aplican a los siete días; abrir/cerrar es siempre por día.
  const mapDays = (wd: number, f: (d: DayState) => DayState) => setDays((ds) => ds.map((d) => (allRef.current || d.wd === wd ? f(d) : d)));
  const patch = (wd: number, p: Partial<Pick<DayState, "start" | "end" | "off">>) => mapDays(wd, (d) => ({ ...d, ...p }));
  const setOpen = (wd: number, open: boolean) => setDays((ds) => ds.map((d) => (d.wd === wd ? { ...d, open } : d)));
  const setCell = (wd: number, m: number, off: boolean) =>
    mapDays(wd, (d) => (d.off.includes(m) === off ? d : { ...d, off: off ? [...d.off, m] : d.off.filter((x) => x !== m) }));

  function copyToAll(src: DayState) {
    setDays((ds) => ds.map((d) => (d.wd === src.wd ? d : { ...d, open: src.open, start: src.start, end: src.end, off: [...src.off] })));
  }

  // Al activar «todos los días» se toma como modelo el primer día abierto y se copia a toda la semana (los abiertos/cerrados se mantienen).
  function toggleAll(on: boolean) {
    setAllDays(on);
    if (!on) return;
    const model = days.find((d) => d.open) ?? days[0];
    setDays((ds) => ds.map((d) => ({ ...d, start: model.start, end: model.end, off: [...model.off] })));
  }

  // Mientras se pinta, se sigue el puntero por toda la pantalla y se aplica a la celda que esté debajo.
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = paint.current;
      if (!p) return;
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-cell]");
      if (!el || Number(el.dataset.wd) !== p.wd) return;
      setCell(p.wd, Number(el.dataset.m), p.off);
    };
    const end = () => {
      paint.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Horarios que verá el cliente para un día: misma función que usa el servidor, con el servicio elegido arriba. */
  const clientStarts = useMemo(
    () => (d: DayState, grid: number[]) => {
      if (!d.open || !svc) return [] as number[];
      const s = hhmmToMin(d.start);
      const e = hhmmToMin(d.end);
      const MIN = 60_000;
      const blocks = d.off.filter((m) => grid.includes(m)).map((c) => [c * MIN, (c + interval) * MIN] as const);
      return generateStarts({ mode, intervalMin: interval, durationMin: svc.durationMin, windows: e > s ? [[s * MIN, e * MIN]] : [], blocks, earliestMs: 0 }).map((ms) => ms / MIN);
    },
    [interval, mode, svc],
  );

  const model = days.find((d) => d.open) ?? days[0];

  /** Un día (o la tarjeta «Todos los días»): horas, grilla, herramientas y vista del cliente. */
  function card(d: DayState, master: boolean) {
    const grid = gridCells(hhmmToMin(d.start), hhmmToMin(d.end), interval);
    const offVisible = d.off.filter((m) => grid.includes(m));
    const enabledCount = grid.length - offVisible.length;
    const starts = clientStarts(d, grid);
    const named = !master; // en «todos los días» los campos con nombre van aparte, uno por día

    return (
      <div key={master ? "all" : d.wd} className="rounded-xl border border-neutral-200 p-3">
        <div className="flex flex-wrap items-center gap-3">
          {master ? (
            <span className="w-32 font-semibold">Todos los días</span>
          ) : (
            <label className="flex w-32 items-center gap-2 font-medium">
              <input type="checkbox" name={`open_${d.wd}`} checked={d.open} onChange={(e) => setOpen(d.wd, e.target.checked)} />
              {d.label}
            </label>
          )}
          <input type="time" {...(named ? { name: `start_${d.wd}` } : {})} aria-label="Apertura" value={d.start} onChange={(e) => patch(d.wd, { start: e.target.value || d.start })} className="input !w-32" />
          <span>a</span>
          <input type="time" {...(named ? { name: `end_${d.wd}` } : {})} aria-label="Cierre" value={d.end} onChange={(e) => patch(d.wd, { end: e.target.value || d.end })} className="input !w-32" />
          {named && <input type="hidden" name={`off_${d.wd}`} value={offVisible.join(",")} />}
          <span className="ml-auto text-xs text-neutral-500">{d.open || master ? `${enabledCount} de ${grid.length} horarios activos` : "Día cerrado"}</span>
        </div>

        {master && (
          <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Días que atienden">
            {days.map((x) => (
              <button
                key={x.wd}
                type="button"
                aria-pressed={x.open}
                onClick={() => setOpen(x.wd, !x.open)}
                className={`rounded-full border px-3 py-1 text-sm font-medium transition ${x.open ? "border-brand bg-brand text-brand-fg" : "border-neutral-300 bg-white text-neutral-500"}`}
              >
                {SHORT[x.wd]}
              </button>
            ))}
          </div>
        )}

        {grid.length > 0 && (
          <div className={`mt-3 space-y-2 ${d.open || master ? "" : "opacity-50"}`}>
            {!d.open && !master && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-600">
                <span>Este día no atiende. Abrilo para elegir qué horarios ofrecer.</span>
                <button type="button" className="btn-ghost !px-2 !py-1" onClick={() => setOpen(d.wd, true)}>
                  Abrir este día
                </button>
              </div>
            )}
            {/* Grilla: tocar alterna una celda; arrastrar pinta varias seguidas. touch-action deja el desplazamiento vertical al celular. */}
            <div
              className={`grid touch-pan-y select-none grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-8 ${d.open || master ? "" : "pointer-events-none"}`}
              onPointerDown={(e) => {
                if (!d.open && !master) return;
                const el = (e.target as HTMLElement).closest<HTMLElement>("[data-cell]");
                if (!el || e.button !== 0) return;
                const m = Number(el.dataset.m);
                const off = !d.off.includes(m); // la primera celda decide si se está desactivando o activando
                paint.current = { wd: d.wd, off };
                setCell(d.wd, m, off);
              }}
            >
              {grid.map((m) => {
                const off = d.off.includes(m);
                return (
                  <button
                    key={m}
                    type="button"
                    data-cell
                    data-wd={d.wd}
                    data-m={m}
                    aria-pressed={!off}
                    // El mouse y el dedo se manejan con el puntero; el teclado (Enter/Espacio) llega como click sin posición.
                    onClick={(e) => e.detail === 0 && setCell(d.wd, m, !off)}
                    className={`rounded-lg border py-1.5 text-sm font-medium tabular-nums transition ${off ? "border-neutral-200 bg-neutral-100 text-neutral-400 line-through" : "border-brand bg-brand text-brand-fg"}`}
                  >
                    {minToHHMM(m)}
                  </button>
                );
              })}
            </div>

            <div className={`flex flex-wrap items-center gap-2 text-xs ${d.open || master ? "" : "pointer-events-none"}`}>
              <button type="button" className="btn-ghost !px-2 !py-1" onClick={() => patch(d.wd, { off: [] })}>
                Activar todos
              </button>
              <button type="button" className="btn-ghost !px-2 !py-1" onClick={() => patch(d.wd, { off: grid })}>
                Desactivar todos
              </button>
              {!master && (
                <button type="button" className="btn-ghost !px-2 !py-1" onClick={() => copyToAll(d)}>
                  Copiar a los demás días
                </button>
              )}
            </div>

            {(d.open || master) && (
              <p className="rounded-lg bg-neutral-50 p-2 text-xs text-neutral-600" aria-live="polite">
                <span className="font-medium">Así lo ve el cliente{svc ? ` (${svc.name}, ${svc.durationMin} min)` : ""}:</span>{" "}
                {starts.length === 0 ? (
                  <span>ningún horario.</span>
                ) : (
                  <>
                    <span className="tabular-nums">{starts.slice(0, PREVIEW_MAX).map(minToHHMM).join(" · ")}</span>
                    {starts.length > PREVIEW_MAX && <span> … (+{starts.length - PREVIEW_MAX} más)</span>}
                  </>
                )}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm">
        <input type="checkbox" checked={allDays} onChange={(e) => toggleAll(e.target.checked)} className="mt-1" />
        <span>
          <span className="font-medium">Todos los días</span>
          <span className="block text-xs text-neutral-500">Usá el mismo horario y la misma grilla toda la semana. Elegís qué días atienden y cualquier cambio se aplica a todos.</span>
        </span>
      </label>

      {services.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label htmlFor="preview-service" className="text-neutral-600">
            Ver los horarios del cliente para:
          </label>
          <select id="preview-service" value={svcId} onChange={(e) => setSvcId(e.target.value)} className="input !w-auto !py-1.5">
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.durationMin} min)
              </option>
            ))}
          </select>
        </div>
      )}

      {allDays ? (
        <>
          {card(model, true)}
          {/* Lo que se guarda: un campo por día (el formulario no cambia). */}
          {days.map((d) => {
            const grid = gridCells(hhmmToMin(d.start), hhmmToMin(d.end), interval);
            return (
              <span key={d.wd} hidden>
                {d.open && <input type="hidden" name={`open_${d.wd}`} value="on" />}
                <input type="hidden" name={`start_${d.wd}`} value={d.start} />
                <input type="hidden" name={`end_${d.wd}`} value={d.end} />
                <input type="hidden" name={`off_${d.wd}`} value={d.off.filter((m) => grid.includes(m)).join(",")} />
              </span>
            );
          })}
        </>
      ) : (
        days.map((d) => card(d, false))
      )}

      <p className="text-xs text-neutral-500">
        El primer turno es a la hora exacta de apertura que elijas (por ejemplo 04:00) y los demás van cada {interval} min desde ahí. Tocá un horario para activarlo o desactivarlo, o arrastrá sobre varios seguidos.
        Los grises no se muestran a los clientes. Acordate de guardar.
      </p>
    </div>
  );
}
