import Link from "next/link";

/** Cambia entre las dos partes de Economía: lo que ingresó y lo que se les paga a los profesionales. */
export function EconomiaNav({ active }: { active: "ingresos" | "sueldos" }) {
  const item = (href: string, id: "ingresos" | "sueldos", label: string) => (
    <Link
      href={href}
      aria-current={active === id ? "page" : undefined}
      style={{ color: active === id ? "#ffffff" : "#1a1a1a", background: active === id ? "#1a1a1a" : "rgba(0,0,0,0.1)" }}
      className="flex-1 rounded-full px-4 py-2 text-center text-sm font-semibold transition active:scale-[0.98]"
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Secciones de Economía" className="mb-3 flex gap-2">
      {item("/admin/economia", "ingresos", "Ingresos")}
      {item("/admin/economia/sueldos", "sueldos", "Sueldos")}
    </nav>
  );
}
