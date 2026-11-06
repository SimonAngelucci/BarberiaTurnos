"use client";

import { useEffect, useRef, useState } from "react";

export type NavItem = { id: string; label: string };

/**
 * Barra superior minimalista: secciones a la izquierda (se desliza en celular y marca la que se está viendo) y, a la derecha,
 * el teléfono para llamar. Los colores salen de la barbería (fondo y texto de la página).
 */
export function SiteNav({ items, phoneHref, phoneLabel }: { items: NavItem[]; phoneHref: string | null; phoneLabel: string | null }) {
  const [active, setActive] = useState(items[0]?.id ?? "");
  const bar = useRef<HTMLDivElement>(null);
  const ids = items.map((x) => x.id).join(",");

  // Sección visible: la que cruza la franja del medio de la pantalla.
  useEffect(() => {
    const els = ids.split(",").map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
    if (!els.length || typeof IntersectionObserver === "undefined") return;
    const seen = new Map<string, boolean>();
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        const current = els.find((el) => seen.get(el.id));
        if (current) setActive(current.id);
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [ids]);

  // Mantiene visible el botón activo cuando la barra desliza (sin mover la página).
  useEffect(() => {
    const box = bar.current;
    const el = box?.querySelector<HTMLElement>(`[data-id="${active}"]`);
    if (!box || !el) return;
    box.scrollTo({ left: el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2, behavior: "smooth" });
  }, [active]);

  return (
    <header
      className="sticky top-0 z-30 border-b border-black/10 backdrop-blur"
      style={{ background: "color-mix(in srgb, var(--page-bg) 92%, transparent)", color: "var(--page-fg)" }}
    >
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-2 sm:px-4">
        <nav aria-label="Secciones de la página" ref={bar} className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {items.map((it) => (
            <a
              key={it.id}
              href={`#${it.id}`}
              data-id={it.id}
              aria-current={active === it.id ? "true" : undefined}
              onClick={() => setActive(it.id)}
              className={`whitespace-nowrap border-b-2 px-3 py-3.5 text-sm font-medium transition ${active === it.id ? "border-current opacity-100" : "border-transparent opacity-60 hover:opacity-100"}`}
            >
              {it.label}
            </a>
          ))}
        </nav>
        {phoneHref && (
          <a href={phoneHref} aria-label={phoneLabel ? `Llamar al ${phoneLabel}` : "Llamar"} className="flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold hover:bg-black/5">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
            </svg>
            {phoneLabel && <span className="hidden sm:inline">{phoneLabel}</span>}
          </a>
        )}
      </div>
    </header>
  );
}
