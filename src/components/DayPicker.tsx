"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DateTime } from "luxon";

export type DayItem = {
  iso: string;
  /** "lun" */
  wd: string;
  day: number;
  /** "nov" */
  mon: string;
  /** "noviembre 2026" */
  monthLabel: string;
  tag: "Hoy" | "Mañana" | null;
  weekend: boolean;
  /** "lunes 3 de noviembre" (para lectores de pantalla) */
  full: string;
};

/** Días desde hoy (en la zona del negocio) listos para el selector. */
export function makeDayItems(timezone: string, count: number): DayItem[] {
  const today = DateTime.now().setZone(timezone).startOf("day");
  return Array.from({ length: count }, (_, i) => {
    const d = today.plus({ days: i }).setLocale("es");
    return {
      iso: d.toISODate()!,
      wd: d.toFormat("ccc").replace(".", ""),
      day: d.day,
      mon: d.toFormat("LLL").replace(".", ""),
      monthLabel: d.toFormat("LLLL yyyy"),
      tag: i === 0 ? "Hoy" : i === 1 ? "Mañana" : null,
      weekend: d.weekday >= 6,
      full: d.toFormat("cccc d 'de' LLLL"),
    };
  });
}

const W = 62; // ancho de cada día
const H = 88;
const GAP = 8;
const STRIDE = W + GAP;

const Chevron = ({ dir }: { dir: "l" | "r" }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d={dir === "l" ? "M10 3 5 8l5 5" : "M6 3l5 5-5 5"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * Selector de días: una cinta desplazable con un resalte que se desliza (con rebote suave) hasta el día elegido.
 * Se puede arrastrar con el mouse, usar las flechas, el teclado (← → Inicio Fin) o el dedo. El mes se actualiza
 * según lo que se está viendo y los bordes se desvanecen cuando hay más días fuera de vista.
 */
export function DayPicker({ days, value, onChange }: { days: DayItem[]; value: string | null; onChange: (iso: string) => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  const btns = useRef<(HTMLButtonElement | null)[]>([]);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const [mid, setMid] = useState(0);
  const [edge, setEdge] = useState({ start: true, end: false });
  const sel = days.findIndex((d) => d.iso === value);

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const center = el.scrollLeft + el.clientWidth / 2 - W / 2;
    setMid(Math.min(days.length - 1, Math.max(0, Math.round(center / STRIDE))));
    setEdge({ start: el.scrollLeft <= 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 });
  }, [days.length]);

  useEffect(() => {
    measure();
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  const center = (i: number) => {
    const el = scroller.current;
    if (el) el.scrollTo({ left: i * STRIDE - (el.clientWidth - W) / 2, behavior: "smooth" });
  };
  const pick = (i: number, focus = false) => {
    onChange(days[i].iso);
    center(i);
    if (focus) btns.current[i]?.focus();
  };
  const page = (dir: 1 | -1) => scroller.current?.scrollBy({ left: dir * STRIDE * 4, behavior: "smooth" });

  function onKeyDown(e: React.KeyboardEvent) {
    const cur = btns.current.findIndex((b) => b === document.activeElement);
    const i = cur >= 0 ? cur : Math.max(sel, 0);
    const to = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? days.length - 1 : null;
    if (to === null) return;
    e.preventDefault();
    pick(Math.min(days.length - 1, Math.max(0, to)), true);
  }

  const fade = (on: boolean) => (on ? 20 : 0);
  const mask = `linear-gradient(to right, transparent 0, #000 ${fade(!edge.start)}px, #000 calc(100% - ${fade(!edge.end)}px), transparent 100%)`;
  const arrow = "flex h-8 w-8 items-center justify-center rounded-full border border-neutral-300 bg-white text-neutral-700 shadow-sm transition active:scale-90 enabled:hover:border-neutral-400 enabled:hover:bg-neutral-50 disabled:opacity-35 motion-reduce:transition-none";

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <div key={days[mid]?.monthLabel} className="animate-rise text-sm font-semibold capitalize">
          {days[mid]?.monthLabel}
        </div>
        <div className="flex gap-1.5">
          <button type="button" className={arrow} onClick={() => page(-1)} disabled={edge.start} aria-label="Días anteriores">
            <Chevron dir="l" />
          </button>
          <button type="button" className={arrow} onClick={() => page(1)} disabled={edge.end} aria-label="Días siguientes">
            <Chevron dir="r" />
          </button>
        </div>
      </div>

      <div
        ref={scroller}
        role="group"
        aria-label="Elegí el día"
        onScroll={measure}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse" || !scroller.current) return;
          drag.current = { x: e.clientX, left: scroller.current.scrollLeft, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || !scroller.current) return;
          const dx = e.clientX - d.x;
          if (Math.abs(dx) > 5) {
            d.moved = true;
            scroller.current.scrollLeft = d.left - dx;
          }
        }}
        onPointerUp={() => setTimeout(() => (drag.current = null), 0)}
        onPointerLeave={() => setTimeout(() => (drag.current = null), 0)}
        onClickCapture={(e) => {
          if (drag.current?.moved) {
            e.stopPropagation(); // un arrastre no cuenta como elegir un día
            e.preventDefault();
          }
        }}
        className="overflow-x-auto overscroll-x-contain px-1 pb-3 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ maskImage: mask, WebkitMaskImage: mask }}
      >
        <div className="relative flex" style={{ gap: GAP, width: days.length * STRIDE - GAP }}>
          {/* Resalte que se desliza hasta el día elegido */}
          <span
            aria-hidden
            className="absolute left-0 top-0 rounded-2xl bg-brand transition-[transform,opacity] duration-[480ms] ease-[cubic-bezier(.34,1.56,.64,1)] motion-reduce:transition-none"
            style={{
              width: W,
              height: H,
              transform: `translateX(${Math.max(sel, 0) * STRIDE}px) scale(${sel >= 0 ? 1 : 0.85})`,
              opacity: sel >= 0 ? 1 : 0,
              boxShadow: "0 12px 22px -10px var(--brand)",
            }}
          />
          {days.map((d, i) => {
            const active = i === sel;
            return (
              <button
                key={d.iso}
                ref={(el) => {
                  btns.current[i] = el;
                }}
                type="button"
                tabIndex={i === Math.max(sel, 0) ? 0 : -1}
                aria-pressed={active}
                aria-label={`${d.full}${d.tag ? ` (${d.tag.toLowerCase()})` : ""}`}
                onClick={() => pick(i)}
                style={{ width: W, height: H }}
                className={`relative z-10 flex shrink-0 select-none flex-col items-center justify-center rounded-2xl border text-center transition-[color,transform,border-color,background-color] duration-300 motion-reduce:transition-none ${
                  active ? "border-transparent text-brand-fg" : "border-neutral-300 bg-white text-neutral-900 hover:-translate-y-0.5 hover:border-neutral-400"
                }`}
              >
                <span className={`text-[11px] font-bold uppercase tracking-wider ${d.weekend && !active ? "text-amber-600" : "opacity-70"}`}>{d.wd}</span>
                <span className="my-0.5 text-[26px] font-extrabold leading-none tabular-nums">{d.day}</span>
                <span className="text-[10px] font-medium uppercase tracking-wide opacity-70">{d.tag ?? d.mon}</span>
                {d.tag === "Hoy" && !active && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-brand" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
