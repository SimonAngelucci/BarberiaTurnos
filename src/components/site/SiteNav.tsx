"use client";

import { useEffect, useRef, useState } from "react";

export type NavItem = { id: string; label: string };

/**
 * Barra de acceso rápido: queda fija arriba, se desliza horizontalmente en celular y marca la sección que se está viendo.
 * Los colores salen de la barbería (fondo y texto de la página), así que funciona con cualquier tema.
 */
export function SiteNav({ items }: { items: NavItem[] }) {
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
    <nav
      aria-label="Secciones de la página"
      className="sticky top-0 z-30 border-b border-black/10 backdrop-blur"
      style={{ background: "color-mix(in srgb, var(--page-bg) 88%, transparent)", color: "var(--page-fg)" }}
    >
      <div ref={bar} className="no-scrollbar mx-auto flex max-w-3xl items-center gap-1 overflow-x-auto px-2 sm:justify-center">
        {items.map((it) => (
          <a
            key={it.id}
            href={`#${it.id}`}
            data-id={it.id}
            aria-current={active === it.id ? "true" : undefined}
            onClick={() => setActive(it.id)}
            className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition ${active === it.id ? "border-current opacity-100" : "border-transparent opacity-60 hover:opacity-100"}`}
          >
            {it.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
