"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NotificationBell } from "./NotificationBell";
import { LogoutButton } from "./LogoutButton";
import { ThemeCycleButton } from "./ui/ThemeToggle";

export type NavLink = {
  href: string;
  label: string;
  /** Otras rutas que también cuentan como esta sección (ej: Personalización incluye las pantallas que se unificaron). */
  also?: string[];
  /** Muestra el globito de reseñas por aprobar. */
  badge?: boolean;
};

/** ¿Estoy en esta sección? «/admin» (Turnos) solo coincide exacto; las demás incluyen sus subpáginas. */
function isActive(path: string, l: NavLink) {
  const hit = (base: string) => (base === "/admin" ? path === base : path === base || path.startsWith(`${base}/`));
  return hit(l.href) || (l.also ?? []).some(hit);
}

/**
 * Menú del panel. Resalta la sección actual (en escritorio y en celular) y, como en el celular el menú se desliza hacia el
 * costado, deja la opción activa a la vista. Usa la ruta del navegador, así sigue correcto al navegar sin recargar.
 */
export function AdminNav({ links, logoUrl, pendingReviews }: { links: NavLink[]; logoUrl: string | null; pendingReviews: number }) {
  const path = usePathname() ?? "";
  const activeRef = useRef<HTMLAnchorElement>(null);
  const bar = useRef<HTMLDivElement>(null);

  // El menú queda fijo arriba al hacer scroll. Su alto se publica como --sticky-offset para que otras barras fijas (ej: los pasos
  // de Personalización) se acomoden debajo y para que los saltos a #anclas no queden tapados (ver globals.css).
  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const publish = () => document.documentElement.style.setProperty("--sticky-offset", `${Math.ceil(el.getBoundingClientRect().height)}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--sticky-offset");
    };
  }, []);

  useEffect(() => {
    // Solo mueve el menú (no la página): inline: "center" con block: "nearest".
    activeRef.current?.scrollIntoView({ inline: "center", block: "nearest", behavior: "auto" });
  }, [path]);

  return (
    // Fijo arriba: -mx-4 + px-4 lo hace llegar a los bordes del contenedor; el fondo tapa lo que pasa por abajo y el padding superior
    // respeta la muesca de iOS (env(safe-area-inset-top)).
    <div ref={bar} className="sticky top-0 z-30 -mx-4 mb-3 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]" style={{ background: "var(--page-bg, #fafafa)" }}>
    <nav aria-label="Panel" className="card flex items-center gap-1 overflow-x-auto !p-2">
      {logoUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={logoUrl} alt="" className="mr-2 h-8 w-8 shrink-0 rounded-full object-cover" />}
      {links.map((l) => {
        const on = isActive(path, l);
        return (
          <Link
            key={l.href}
            href={l.href}
            ref={on ? activeRef : undefined}
            aria-current={on ? "page" : undefined}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              on ? "bg-brand text-brand-fg shadow-sm" : "text-neutral-700 hover:bg-neutral-100"
            }`}
          >
            {l.label}
            {l.badge && pendingReviews > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[11px] font-semibold text-white" title="Reseñas por aprobar">
                {pendingReviews}
              </span>
            )}
          </Link>
        );
      })}
      <div className="ml-auto flex shrink-0 items-center gap-1 pl-2">
        <ThemeCycleButton />
        <NotificationBell />
        <LogoutButton />
      </div>
    </nav>
    </div>
  );
}
