"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { NotificationBell } from "./NotificationBell";
import { ThemeCycleButton } from "./ui/ThemeToggle";
import { AppLogo } from "./AppLogo";
import { BottomNav, isActive } from "./BottomNav";
import type { IconName } from "./ui/Icon";

export type NavLink = {
  href: string;
  label: string;
  icon: IconName;
  /** Otras rutas que también cuentan como esta sección (ej: Inicio incluye Clientes y Profesionales). */
  also?: string[];
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
  const path = usePathname() ?? "";
  const title = links.find((l) => isActive(path, l))?.label ?? "Mi panel";

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
      <div ref={bar} className="topbar sticky top-0 z-30 -mx-4 mb-3 grid grid-cols-[1fr_auto_1fr] items-center px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-md" style={{ background: "var(--hero)", color: "var(--on-hero)" }}>
        <div className="flex items-center gap-2.5">
          {logoUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" /> : <AppLogo size={36} />}
        </div>
        <span className="text-center text-xs font-semibold uppercase tracking-[0.22em]">{title}</span>
        <div className="flex shrink-0 items-center justify-end gap-1.5">
          <ThemeCycleButton />
          <NotificationBell />
        </div>
      </div>
      <BottomNav links={links} pendingReviews={pendingReviews} />
    </>
  );
}
