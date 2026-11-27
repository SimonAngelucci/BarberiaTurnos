"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./ui/Icon";
import { SectionLabel } from "./ui/SectionLabel";

type Item = { href: string; label: string; icon: IconName; also?: string[] };

/**
 * TODAS las secciones del panel, con los nombres de siempre. Las 5 de la barra inferior (Inicio, Turnos, Servicios, Economía,
 * Cuenta) más las que cuelgan de ellas (Profesionales, Clientes, Horarios, Pagos, Personalización). Las secciones nuevas
 * se agregan siempre al final.
 */
export const MENU_ITEMS: Item[] = [
  { href: "/admin/turnos", label: "Turnos", icon: "calendar" },
  { href: "/admin", label: "Inicio", icon: "home" },
  { href: "/admin/services", label: "Servicios", icon: "scissors" },
  { href: "/admin/barbers", label: "Profesionales", icon: "users" },
  { href: "/admin/customers", label: "Clientes", icon: "heart" },
  { href: "/admin/schedule", label: "Horarios", icon: "clock" },
  { href: "/admin/economia", label: "Economía", icon: "wallet" },
  { href: "/admin/payments", label: "Pagos", icon: "credit-card" },
  { href: "/admin/personalizacion", label: "Personalización", icon: "palette", also: ["/admin/settings", "/admin/design", "/admin/profile"] },
  { href: "/admin/account", label: "Cuenta", icon: "user", also: ["/admin/billing"] },
  // Secciones nuevas: siempre al final.
  { href: "/admin/promociones", label: "Promociones", icon: "gift" },
  { href: "/admin/economia/sueldos", label: "Sueldos", icon: "wallet" },
];

const hit = (path: string, base: string) => (base === "/admin" ? path === base : path === base || path.startsWith(`${base}/`));

/** Botón de acceso rápido (grilla) que abre una hoja desde abajo con todas las secciones del panel. */
export function AdminMenu() {
  const path = usePathname() ?? "";
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button type="button" aria-label="Todas las secciones" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} className="flex h-9 w-9 items-center justify-center rounded-full">
        <Icon name="layout-grid" size={20} />
      </button>

      {open &&
        // En un portal: la barra de arriba tiene desenfoque de fondo y eso encerraría a un elemento «fixed».
        createPortal(
        <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Secciones del panel">
          <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-black/55" onClick={() => setOpen(false)} />
          <div className="app-themed relative max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-[2.5rem] bg-ink px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5 text-white shadow-2xl animate-rise">
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-white/25" aria-hidden />
            <div className="mb-4 flex items-center justify-between">
              <SectionLabel as="h2" className="!text-primary">
                Secciones
              </SectionLabel>
              <button type="button" aria-label="Cerrar" onClick={() => setOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10">
                <Icon name="x" size={18} />
              </button>
            </div>
            <ul className="grid grid-cols-2 gap-3">
              {MENU_ITEMS.map((it) => {
                // Si dos secciones coinciden (Economía / Sueldos), se marca solo la más específica.
                const longer = MENU_ITEMS.some((o) => o.href.length > it.href.length && o.href.startsWith(`${it.href}/`) && hit(path, o.href));
                const on = !longer && (hit(path, it.href) || (it.also ?? []).some((a) => hit(path, a)));
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      aria-current={on ? "page" : undefined}
                      style={{ color: on ? "var(--on-primary)" : "#ffffff" }}
                      className={`flex items-center gap-2 rounded-2xl border p-2.5 text-[12.5px] font-semibold leading-tight transition active:scale-[0.97] ${on ? "border-transparent bg-primary" : "border-ink-line bg-ink-soft"}`}
                    >
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${on ? "bg-black/10" : "bg-ink text-primary"}`}>
                        <Icon name={it.icon} size={18} />
                      </span>
                      <span className="min-w-0 break-words">{it.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>,
          document.body,
        )}
    </>
  );
}
