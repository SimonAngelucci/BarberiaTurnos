import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { ThemeCycleButton } from "@/components/ui/ThemeToggle";

/**
 * Encabezado de las pantallas de la web pública (reservar, confirmado, turno, pago, galería): bloque de color con la esquina
 * inferior curva, flecha de volver, logo y nombre del negocio, selector de tema y el título grande y liviano. `children` va debajo.
 */
export function PublicHeader({ name, logoUrl, title, back, icon, children }: { name: string; logoUrl: string | null; title: string; back?: { href: string; label: string }; icon?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="hero-block px-5 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <div className="flex items-center gap-3">
        {back && (
          <Link href={back.href} aria-label={back.label} title={back.label} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fbfaf8] text-[#1a1a1a] shadow-sm ring-4 ring-white/30 transition active:scale-95">
            <Icon name="arrow-left" size={18} />
          </Link>
        )}
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {logoUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={logoUrl} alt="" className="h-9 w-9 shrink-0 rounded-full bg-white object-cover" />}
          <p className="truncate text-xs font-semibold uppercase tracking-[0.18em] opacity-80">{name}</p>
        </div>
        <div className="topbar shrink-0">
          <ThemeCycleButton />
        </div>
      </div>
      {icon && <div className="mt-6">{icon}</div>}
      <h1 className={`${icon ? "mt-3" : "mt-6"} text-3xl font-light leading-tight tracking-tight`}>{title}</h1>
      {children && <div className="mt-3">{children}</div>}
    </header>
  );
}