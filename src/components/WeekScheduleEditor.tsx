"use client";

import { useState } from "react";
import { minToHHMM, hhmmToMin } from "@/lib/format";

export type DayState = { wd: number; label: string; open: boolean; start: string; end: string; off: number[] };

/** Celdas de la grilla: desde `start` cada `interval` min mientras la celda entre completa. */
function cells(start: string, end: string, interval: number) {
  const s = hhmmToMin(start);
  const e = hhmmToMin(end);
  const out: number[] = [];
  if (!(e > s) || interval < 5) return out;
  for (let m = s; m + interval <= e; m += interval) out.push(m);
  return out;
}

export function WeekScheduleEditor({ initial, interval }: { initial: DayState[]; interval: number }) {
  const [days, setDays] = useState(initial);

  const patch = (wd: number, p: Partial<DayState>) => setDays((ds) => ds.map((d) => (d.wd === wd ? { ...d, ...p } : d)));

  function toggle(d: DayState, m: number) {
    patch(d.wd, { off: d.off.includes(m) ? d.off.filter((x) => x !== m) : [...d.off, m] });
  }

  function copyToAll(src: DayState) {
    setDays((ds) => ds.map((d) => (d.wd === src.wd ? d : { ...d, open: src.open, start: src.start, end: src.end, off: [...src.off] })));
  }

  return (
    <div className="space-y-4">
      {days.map((d) => {
        const grid = cells(d.start, d.end, interval);
        const offVisible = d.off.filter((m) => grid.includes(m));
        const enabledCount = grid.length - offVisible.length;
        return (
          <div key={d.wd} className="rounded-xl border border-neutral-200 p-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex w-32 items-center gap-2 font-medium">
                <input type="checkbox" name={`open_${d.wd}`} checked={d.open} onChange={(e) => patch(d.wd, { open: e.target.checked })} />
                {d.label}
              </label>
              <input
                type="time"
                name={`start_${d.wd}`}
                value={d.start}
                onChange={(e) => patch(d.wd, { start: e.target.value || d.start })}
                className="input !w-32"
              />
              <span>a</span>
              <input
                type="time"
                name={`end_${d.wd}`}
                value={d.end}
                onChange={(e) => patch(d.wd, { end: e.target.value || d.end })}
                className="input !w-32"
              />
              <input type="hidden" name={`off_${d.wd}`} value={offVisible.join(",")} />
              {d.open && <span className="ml-auto text-xs text-neutral-500">{enabledCount} de {grid.length} horarios activos</span>}
            </div>

            {d.open && grid.length > 0 && (
              <div className="mt-3 space-y-2">
                <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-8">
                  {grid.map((m) => {
                    const off = d.off.includes(m);
                    return (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={!off}
                        onClick={() => toggle(d, m)}
                        className={`rounded-lg border py-1.5 text-sm font-medium tabular-nums transition ${
                          off ? "border-neutral-200 bg-neutral-100 text-neutral-400 line-through" : "border-brand bg-brand text-brand-fg"
                        }`}
                      >
                        {minToHHMM(m)}
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
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
              </div>
            )}
          </div>
        );
      })}
      <p className="text-xs text-neutral-500">Tocá un horario para activarlo o desactivarlo. Los grises no se muestran a los clientes.</p>
    </div>
  );
}
