"use client";

import { useRef, useState } from "react";
import { CountBadge } from "./SectionLabel";

export type FolderTab = { id: string; label: string; count?: number | string; content: React.ReactNode };

/**
 * Tabs tipo carpeta: la pestaña activa comparte superficie con la tarjeta de abajo (esquinas cóncavas en la unión) y la inactiva
 * queda suelta sobre el color de fondo. Accesible: roles tablist/tab/tabpanel, flechas del teclado y foco rodante.
 */
export function FolderTabs({ tabs, label, value, onValueChange, plain = false }: { tabs: FolderTab[]; label: string; value?: number; onValueChange?: (n: number) => void; /** Sin bloque de color detrás: las pestañas inactivas usan el color de texto de la página. */ plain?: boolean }) {
  // Sin `value` maneja su propio estado; con `value` es controlado (la pantalla puede cambiar otras cosas según la pestaña).
  const [own, setOwn] = useState(0);
  const on = value ?? own;
  const setOn = (n: number) => {
    setOwn(n);
    onValueChange?.(n);
  };
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const go = (n: number) => {
    const next = (n + tabs.length) % tabs.length;
    setOn(next);
    refs.current[next]?.focus();
  };

  return (
    <div>
      <div role="tablist" aria-label={label} className="flex items-end">
        {tabs.map((t, n) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[n] = el;
            }}
            role="tab"
            id={`ftab-${t.id}`}
            aria-selected={n === on}
            aria-controls={`ftab-panel-${t.id}`}
            tabIndex={n === on ? 0 : -1}
            onClick={() => setOn(n)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") go(n + 1);
              else if (e.key === "ArrowLeft") go(n - 1);
              else return;
              e.preventDefault();
            }}
            className={`ftab ${plain ? "ftab-plain" : ""} ${n === on ? "ftab-on" : ""} ${n === on && n > 0 ? "ftab-left" : ""}`}
          >
            <span className="whitespace-nowrap text-lg font-light tracking-tight sm:text-2xl">{t.label}</span>
            {t.count !== undefined && <CountBadge>{t.count}</CountBadge>}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`ftab-panel-${tabs[on].id}`} aria-labelledby={`ftab-${tabs[on].id}`} className={`card !rounded-[1.75rem] !border-0 !p-5 ${on === 0 ? "!rounded-tl-none" : ""}`}>
        {tabs[on].content}
      </div>
    </div>
  );
}
