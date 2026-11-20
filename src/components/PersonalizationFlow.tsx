"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

export type FlowStep = {
  id: string;
  label: string;
  /** Texto corto debajo del título del paso. */
  hint?: string;
  /** Otros nombres con los que se puede llegar a este paso (links viejos: #mi-pagina, #contacto…). */
  anchors?: string[];
  /** Globito (ej: reseñas por aprobar). */
  badge?: number;
  node: React.ReactNode;
};

/**
 * Personalización por pasos: un acceso rápido arriba, el progreso («Paso 2 de 5») y «Anterior / Siguiente» abajo.
 *
 * Todos los pasos quedan montados y solo se ocultan los que no se están viendo: así lo que se escribió en un paso no se
 * pierde al pasar a otro (cada sección sigue guardándose con su propio botón). El paso actual se refleja en el link
 * (#contacto…), así se puede compartir, recargar o volver con «atrás».
 */
export function PersonalizationFlow({ steps }: { steps: FlowStep[] }) {
  const top = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const [seen, setSeen] = useState<Set<number>>(() => new Set([0]));

  const indexOf = useCallback(
    (hash: string) => {
      const h = hash.replace(/^#/, "");
      const i = steps.findIndex((s) => s.id === h || (s.anchors ?? []).includes(h));
      return i >= 0 ? i : null;
    },
    [steps],
  );

  // Entrada por link (#acerca…) y botón «atrás» del navegador.
  useEffect(() => {
    const sync = () => {
      const i = indexOf(window.location.hash);
      if (i !== null) {
        setCurrent(i);
        setSeen((s) => new Set(s).add(i));
      }
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [indexOf]);

  const go = (i: number) => {
    const n = Math.max(0, Math.min(steps.length - 1, i));
    setCurrent(n);
    setSeen((s) => new Set(s).add(n));
    history.replaceState(null, "", `#${steps[n].id}`);
    // Se vuelve al comienzo del flujo para ver el paso desde arriba (sin barras flotantes).
    top.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };

  const last = current === steps.length - 1;
  const pct = ((current + 1) / steps.length) * 100;

  return (
    <div ref={top} className="scroll-mt-4 space-y-5">
      <nav aria-label="Secciones de Personalización" className="space-y-3">
        <ol className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
          {steps.map((s, i) => {
            const on = i === current;
            const done = !on && seen.has(i);
            return (
              <li key={s.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-current={on ? "step" : undefined}
                  className={`flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition ${
                    on ? "border-brand bg-brand text-brand-fg shadow-sm" : done ? "border-neutral-300 bg-white text-neutral-800 hover:border-neutral-400" : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300"
                  }`}
                >
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${on ? "bg-brand-fg/20" : done ? "bg-green-100 text-green-700" : "bg-neutral-100"}`}>{done ? "✓" : i + 1}</span>
                  {s.label}
                  {!!s.badge && s.badge > 0 && <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{s.badge}</span>}
                </button>
              </li>
            );
          })}
        </ol>
        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-neutral-500">
            <span className="font-semibold text-neutral-700">
              Paso {current + 1} de {steps.length} · {steps[current].label}
            </span>
            <span>{Math.round(pct)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-neutral-200" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={current + 1} aria-label="Progreso de la personalización">
            <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </nav>

      {steps.map((s, i) => (
        <section key={s.id} data-step={s.id} hidden={i !== current} aria-label={s.label} className="space-y-4">
          {s.node}
        </section>
      ))}

      <div className="flex items-center justify-between gap-3 border-t border-neutral-200 pt-4">
        <button type="button" className="btn-ghost" onClick={() => go(current - 1)} disabled={current === 0}>
          ← Anterior
        </button>
        <p className="hidden text-center text-xs text-neutral-500 sm:block">Guardá cada sección con su botón antes de seguir.</p>
        {last ? (
          <Link href="/admin" className="btn">
            Terminar
          </Link>
        ) : (
          <button type="button" className="btn" onClick={() => go(current + 1)}>
            Siguiente →
          </button>
        )}
      </div>
    </div>
  );
}
