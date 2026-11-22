"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { NotificationBell } from "./NotificationBell";
import { LogoutButton } from "./LogoutButton";
import { ThemeCycleButton } from "./ui/ThemeToggle";
import { AppLogo } from "./AppLogo";
import { BottomNav } from "./BottomNav";
import type { IconName } from "./ui/Icon";

export type NavLink = {
  href: string;
  label: string;
  icon: IconName;
  /** Otras rutas que también cuentan como esta sección (ej: Inicio incluye Clientes y Profesionales). */
  also?: string[];
  /** La pantalla tiene bloque de color arriba (ver Hero): la barra superior toma ese color. */
  hero?: boolean;
  /** Muestra el globito de reseñas por aprobar. */
  badge?: boolean;
};

/**
 * Marco de navegación del panel: barra superior fija (logo y acciones) y barra inferior con las pestañas principales
 * (ver BottomNav). El alto de la barra superior se publica como --sticky-offset para que otras barras fijas (ej: los pasos
 * de Personalización) se acomoden debajo y para que los saltos a #anclas no queden tapados (ver globals.css).
 */
export function AdminNav({ links, logoUrl, pendingReviews }: { links: NavLink[]; logoUrl: string | null; pendingReviews: number }) {
  const bar = useRef<HTMLDivElement>(null);
  // En Inicio la barra es parte del bloque de color de arriba (ver Hero): mismo color y texto oscuro encima.
  const path = usePathname();
  const onHome = !!links.find((l) => l.href === path)?.hero;

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

  return (
    <>
      {/* Barra superior fija y translúcida: logo y acciones. El padding superior respeta la muesca de iOS. */}
      <div ref={bar} className="sticky top-0 z-30 -mx-4 mb-3 flex items-center justify-between px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-md" style={onHome ? { background: "var(--hero)", color: "var(--on-primary)" } : { background: "color-mix(in srgb, var(--page-bg, #fafafa) 82%, transparent)" }}>
        <div className="flex items-center gap-2.5">
          {logoUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" /> : <AppLogo size={36} />}
          <span className="text-sm font-semibold tracking-wide">Mi panel</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <ThemeCycleButton />
          <NotificationBell />
          <LogoutButton />
        </div>
      </div>
      <BottomNav links={links} pendingReviews={pendingReviews} />
    </>
  );
}
