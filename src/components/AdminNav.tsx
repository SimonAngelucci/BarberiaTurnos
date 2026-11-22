"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NotificationBell } from "./NotificationBell";
import { LogoutButton } from "./LogoutButton";
import { ThemeCycleButton } from "./ui/ThemeToggle";
import { AppLogo } from "./AppLogo";
import { Icon, type IconName } from "./ui/Icon";

export type NavLink = {
  href: string;
  label: string;
  /** Otras rutas que también cuentan como esta sección (ej: Personalización incluye las pantallas que se unificaron). */
  also?: string[];
  /** Muestra el globito de reseñas por aprobar. */
  badge?: boolean;
};

/** Ícono de cada sección en el menú flotante. */
const ICONS: Record<string, IconName> = {
  "/admin": "calendar",
  "/admin/turnos": "play",
  "/admin/services": "scissors",
  "/admin/barbers": "users",
  "/admin/customers": "heart",
  "/admin/schedule": "clock",
  "/admin/economia": "wallet",
  "/admin/payments": "credit-card",
  "/admin/personalizacion": "palette",
  "/admin/account": "settings",
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
    <>
      {/* Barra superior fija y transparente: logo y acciones. El padding superior respeta la muesca de iOS. */}
      <div ref={bar} className="sticky top-0 z-30 -mx-4 mb-3 flex items-center justify-between px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-md" style={{ background: "color-mix(in srgb, var(--page-bg, #fafafa) 82%, transparent)" }}>
        <div className="flex items-center gap-2.5">
          {logoUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-white/20" /> : <AppLogo size={36} />}
          <span className="text-sm font-semibold">Mi panel</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <ThemeCycleButton />
          <NotificationBell />
          <LogoutButton />
        </div>
      </div>

      {/* Menú flotante abajo, en píldora: solo la sección activa muestra su nombre; el resto son íconos (con nombre para lectores). */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <nav aria-label="Panel" className="dock no-scrollbar pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-full p-1.5">
          {links.map((l) => {
            const on = isActive(path, l);
            return (
              <Link
                key={l.href}
                href={l.href}
                ref={on ? activeRef : undefined}
                aria-current={on ? "page" : undefined}
                title={l.label}
                className="dock-item relative flex h-11 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-semibold transition-colors"
              >
                <Icon name={ICONS[l.href] ?? "circle"} size={20} />
                <span className={on ? "whitespace-nowrap" : "sr-only"}>{l.label}</span>
                {l.badge && pendingReviews > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 min-w-[1.1rem] rounded-full bg-amber-500 px-1 text-center text-[10px] font-bold leading-[1.1rem] text-white" title="Reseñas por aprobar">
                    {pendingReviews}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </>
  );
}