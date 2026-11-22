"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./ui/Icon";
import type { NavLink } from "./AdminNav";
import { EV_INTENT, goToTab } from "./SwipeShell";

/** ¿Estoy en esta sección? La raíz «/admin» solo coincide exacta; las demás incluyen sus subpáginas (y las rutas de `also`). */
export function isActive(path: string, l: NavLink) {
  const hit = (base: string) => (base === "/admin" ? path === base : path === base || path.startsWith(`${base}/`));
  return hit(l.href) || (l.also ?? []).some(hit);
}

/** Cantidad de casilleros visibles a la vez. Con más pestañas la barra pasa a ser un carrusel con la activa en el centro. */
const SLOTS = 5;

/**
 * Barra inferior fija. La sección activa va en un círculo del color de acento que sobresale de la barra (con un hueco curvo
 * alrededor). Con hasta 5 pestañas el círculo viaja entre casilleros fijos; con más, la barra es un carrusel con snap: se ven
 * siempre 5 casilleros completos y la activa se centra en el círculo. Respeta el área segura de iOS y «reducir movimiento».
 */
export function BottomNav({ links, pendingReviews }: { links: NavLink[]; pendingReviews: number }) {
  const path = usePathname() ?? "";
  const [intent, setIntent] = useState<string | null>(null); // pestaña a la que ya se está yendo (el círculo se adelanta)
  const track = useRef<HTMLUListElement>(null);
  const carousel = links.length > SLOTS;
  const current = links.findIndex((l) => isActive(path, l));
  const shown = intent ? links.findIndex((l) => l.href === intent) : current;
  const on = shown >= 0 ? shown : 0;

  useEffect(() => setIntent(null), [path]);
  useEffect(() => {
    const h = (e: Event) => setIntent((e as CustomEvent<string>).detail);
    window.addEventListener(EV_INTENT, h);
    return () => window.removeEventListener(EV_INTENT, h);
  }, []);

  // Modo carrusel: la opción activa se centra en el círculo.
  useEffect(() => {
    const ul = track.current;
    const li = ul?.children[on] as HTMLElement | undefined;
    if (!carousel || !ul || !li) return;
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    ul.scrollTo({ left: li.offsetLeft - (ul.clientWidth - li.clientWidth) / 2, behavior: reducedMotion ? "auto" : "smooth" });
  }, [on, carousel]);

  const activeLink = links[on];
  const bubbleLeft = carousel ? "50%" : `calc(0.5rem + (100% - 1rem) * ${(on + 0.5) / links.length})`;

  return (
    <div className="dock-wrap pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4">
      <nav aria-label="Panel" className="dock pointer-events-auto relative w-full max-w-md rounded-[2rem]">
        <ul
          ref={track}
          className={carousel ? "no-scrollbar flex snap-x snap-mandatory overflow-x-auto rounded-[2rem] px-[40%]" : "grid rounded-[2rem] px-2"}
          style={carousel ? undefined : { gridTemplateColumns: `repeat(${links.length}, minmax(0, 1fr))` }}
        >
          {links.map((l, i) => (
            <li key={l.href} className={carousel ? "w-1/5 shrink-0 snap-center" : undefined} style={carousel ? { minWidth: `${100 / SLOTS}%` } : undefined}>
              <Link
                href={l.href}
                prefetch
                aria-current={i === current ? "page" : undefined}
                title={l.label}
                onClick={(e) => {
                  // Clic simple: se navega con la animación de pestañas. Con Ctrl/⌘/medio clic queda el comportamiento normal del link.
                  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                  e.preventDefault();
                  goToTab(l.href);
                }}
                className="dock-item relative flex h-16 items-center justify-center rounded-[2rem] outline-offset-[-4px] focus-visible:outline focus-visible:outline-2"
              >
                <Icon name={l.icon} size={22} className={i === on ? "opacity-0" : ""} />
                <span className="sr-only">{l.label}</span>
                {l.badge && pendingReviews > 0 && i !== on && <span aria-hidden className="absolute right-[28%] top-4 h-2.5 w-2.5 rounded-full bg-primary-strong ring-2 ring-[var(--surface)] scale-75" />}
              </Link>
            </li>
          ))}
        </ul>
        {/* Círculo elevado con el ícono de la sección activa: el hueco curvo sale del anillo del color de la barra. */}
        <span aria-hidden className="dock-bubble" style={{ left: bubbleLeft }}>
          <Icon key={activeLink?.icon} name={activeLink?.icon ?? "circle"} size={24} className="animate-rise" />
        </span>
      </nav>
    </div>
  );
}
