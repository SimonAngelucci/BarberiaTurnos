"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NotificationBell } from "./NotificationBell";
import { LogoutButton } from "./LogoutButton";

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

  useEffect(() => {
    // Solo mueve el menú (no la página): inline: "center" con block: "nearest".
    activeRef.current?.scrollIntoView({ inline: "center", block: "nearest", behavior: "auto" });
  }, [path]);

  return (
    <nav aria-label="Panel" className="card mb-3 flex items-center gap-1 overflow-x-auto !p-2">
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
        <NotificationBell />
        <LogoutButton />
      </div>
    </nav>
  );
}
