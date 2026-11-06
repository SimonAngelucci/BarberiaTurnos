"use client";

import { useEffect, useRef, useState } from "react";
import { minToHHMM, hhmmToMin } from "@/lib/format";
import { cellsInRange, gridCells } from "@/lib/schedule-grid";

export type DayState = { wd: number; label: string; open: boolean; start: string; end: string; off: number[] };

/**
 * Editor semanal de horarios. Cada celda de la grilla se puede activar o desactivar con un toque, o pasando el dedo/mouse por
 * encima de varias seguidas («pintar»). Además hay herramientas para actuar sobre todo el día o sobre un rango de horas.
 */
export function WeekScheduleEditor({ initial, interval }: { initial: DayState[]; interval: number }) {
  const [days, setDays] = useState(initial);
  const [range, setRange] = useState<Record<number, { from: string; to: string }>>({});
  // Pintando: el valor que se aplica a las celdas que se vayan tocando (true = desactivar) y el día en que empezó.
  const paint = useRef<{ wd: number; off: boolean } | null>(null);

  const patch = (wd: number, p: Partial<DayState>) => setDays((ds) => ds.map((d) => (d.wd === wd ? { ...d, ...p } : d)));

  const setCell = (wd: number, m: number, off: boolean) =>
    setDays((ds) => ds.map((d) => (d.wd !== wd || d.off.includes(m) === off ? d : { ...d, off: off ? [...d.off, m] : d.off.filter((x) => x !== m) })));

  const setMany = (wd: number, cells: number[], off: boolean) =>
    setDays((ds) =>
      ds.map((d) => {
        if (d.wd !== wd) return d;
        const rest = d.off.filter((x) => !cells.includes(x));
        return { ...d, off: off ? [...rest, ...cells] : rest };
      }),
    );

  function copyToAll(src: DayState) {
    setDays((ds) => ds.map((d) => (d.wd === src.wd ? d : { ...d, open: src.open, start: src.start, end: src.end, off: [...src.off] })));
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
  }, []);

  return (
    <div className="space-y-4">
      {days.map((d) => {
        const grid = gridCells(hhmmToMin(d.start), hhmmToMin(d.end), interval);
        const offVisible = d.off.filter((m) => grid.includes(m));
        const enabledCount = grid.length - offVisible.length;
        const r = range[d.wd] ?? { from: d.start, to: d.end };
        const applyRange = (off: boolean) => {
          const from = hhmmToMin(r.from);
          const to = hhmmToMin(r.to);
          if (!(to > from)) return;
          setMany(d.wd, cellsInRange(grid, interval, from, to), off);
        };
        return (
          <div key={d.wd} className="rounded-xl border border-neutral-200 p-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex w-32 items-center gap-2 font-medium">
                <input type="checkbox" name={`open_${d.wd}`} checked={d.open} onChange={(e) => patch(d.wd, { open: e.target.checked })} />
                {d.label}
              </label>
              <input type="time" name={`start_${d.wd}`} value={d.start} onChange={(e) => patch(d.wd, { start: e.target.value || d.start })} className="input !w-32" />
              <span>a</span>
              <input type="time" name={`end_${d.wd}`} value={d.end} onChange={(e) => patch(d.wd, { end: e.target.value || d.end })} className="input !w-32" />
              <input type="hidden" name={`off_${d.wd}`} value={offVisible.join(",")} />
              {d.open && (
                <span className="ml-auto text-xs text-neutral-500">
                  {enabledCount} de {grid.length} horarios activos
                </span>
              )}
            </div>

            {d.open && grid.length > 0 && (
              <div className="mt-3 space-y-2">
                {/* Grilla: tocar alterna una celda; arrastrar pinta varias seguidas. touch-action deja el desplazamiento vertical al celular. */}
                <div
                  className="grid touch-pan-y select-none grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-8"
                  onPointerDown={(e) => {
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
                        className={`rounded-lg border py-1.5 text-sm font-medium tabular-nums transition ${
                          off ? "border-neutral-200 bg-neutral-100 text-neutral-400 line-through" : "border-brand bg-brand text-brand-fg"
                        }`}
                      >
                        {minToHHMM(m)}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <button type="button" className="btn-ghost !px-2 !py-1" onClick={() => patch(d.wd, { off: [] })}>
                    Activar todos
                  </button>
                  <button type="button" className="btn-ghost !px-2 !py-1" onClick={() => patch(d.wd, { off: grid })}>
                    Desactivar todos
                  </button>
                  <button type="button" className="btn-ghost !px-2 !py-1" onClick={() => copyToAll(d)}>
                    Copiar a los demás días
                  </button>
                </div>

                {/* Rango: activar o desactivar de una vez todos los horarios entre dos horas (ej: la pausa de 13:00 a 14:00) */}
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-neutral-50 p-2 text-xs">
                  <span className="font-medium text-neutral-600">Rango:</span>
                  <input type="time" aria-label="Desde" value={r.from} onChange={(e) => setRange((x) => ({ ...x, [d.wd]: { ...r, from: e.target.value || r.from } }))} className="input !w-28 !py-1 !text-sm" />
                  <span>a</span>
                  <input type="time" aria-label="Hasta" value={r.to} onChange={(e) => setRange((x) => ({ ...x, [d.wd]: { ...r, to: e.target.value || r.to } }))} className="input !w-28 !py-1 !text-sm" />
                  <button type="button" className="btn-ghost !px-2 !py-1" onClick={() => applyRange(true)}>
                    Desactivar rango
                  </button>
                  <button type="button" className="btn-ghost !px-2 !py-1" onClick={() => applyRange(false)}>
                    Activar rango
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      <p className="text-xs text-neutral-500">
        Tocá un horario para activarlo o desactivarlo, o arrastrá sobre varios seguidos para marcarlos de una vez. Los grises no se muestran a los clientes. Acordate de guardar.
      </p>
    </div>
  );
}
