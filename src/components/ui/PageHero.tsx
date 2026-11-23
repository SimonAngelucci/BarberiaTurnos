import Link from "next/link";
import { Hero } from "./Hero";
import { Icon } from "./Icon";

/**
 * Encabezado de cada pantalla del panel: bloque de color con el título (liviano y grande), una línea de contexto y, en las
 * pantallas secundarias, la flecha para volver. `children` va debajo (tabs, accesos, resúmenes…). El texto usa --on-primary,
 * así se lee tanto sobre el cian como sobre el color del negocio y en modo oscuro.
 */
export function PageHero({ title, subtitle, back, children }: { title: string; subtitle?: React.ReactNode; back?: { href: string; label: string }; children?: React.ReactNode }) {
  return (
    <Hero className="mb-6">
      <div className="on-hero flex items-center gap-3">
        {back && (
          <Link href={back.href} aria-label={back.label} title={back.label} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fbfaf8] text-[#1a1a1a] shadow-sm ring-4 ring-white/30 transition active:scale-95">
            <Icon name="arrow-left" size={18} />
          </Link>
        )}
        <h1 className="min-w-0 flex-1">{title}</h1>
      </div>
      {subtitle && <p className="on-hero mt-2 max-w-xl text-sm opacity-80">{subtitle}</p>}
      {children && <div className="mt-4">{children}</div>}
    </Hero>
  );
}
