import Link from "next/link";
import { Icon, type IconName } from "./Icon";

export type QuickLink = { href: string; label: string; icon: IconName };

/** Accesos a las secciones que no tienen pestaña propia (Clientes, Profesionales, Pagos…): chips con ícono en cuadrado redondeado. */
export function QuickLinks({ items, className = "" }: { items: QuickLink[]; className?: string }) {
  return (
    <nav aria-label="Accesos" className={`grid grid-cols-2 gap-2 ${className}`}>
      {items.map((l) => (
        <Link key={l.href} href={l.href} className="flex min-h-[3.25rem] min-w-0 items-center gap-2.5 rounded-2xl bg-surface py-2 pl-2 pr-3 text-sm font-semibold transition active:scale-[.98]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink text-primary">
            <Icon name={l.icon} size={18} />
          </span>
          <span className="min-w-0 truncate">{l.label}</span>
        </Link>
      ))}
    </nav>
  );
}

/** Los accesos del panel, para mostrar en las pantallas que sirven de punto de partida. */
export const PANEL_SHORTCUTS: Record<"clientes" | "profesionales" | "pagos" | "personalizacion" | "horarios", QuickLink> = {
  clientes: { href: "/admin/customers", label: "Clientes", icon: "heart" },
  profesionales: { href: "/admin/barbers", label: "Profesionales", icon: "users" },
  pagos: { href: "/admin/payments", label: "Pagos", icon: "credit-card" },
  personalizacion: { href: "/admin/personalizacion", label: "Personalización", icon: "palette" },
  horarios: { href: "/admin/schedule", label: "Horarios", icon: "clock" },
};
