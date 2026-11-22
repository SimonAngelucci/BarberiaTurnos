/** Contador cuadrado chico con borde, al lado de un título (ej: SERVICIOS [4]). */
export function CountBadge({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex min-w-[1.5rem] items-center justify-center rounded-lg border px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular-nums ${className}`} style={{ borderColor: "color-mix(in srgb, currentColor 35%, transparent)" }}>
      {children}
    </span>
  );
}

/** Título de sección: mayúsculas chicas con espaciado y, opcional, contador. Usa el color de texto atenuado del tema. */
export function SectionLabel({ children, count, className = "", as: Tag = "h2" }: { children: React.ReactNode; count?: number | string; className?: string; as?: "h2" | "h3" | "p" }) {
  return (
    <Tag className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted ${className}`}>
      {children}
      {count !== undefined && <CountBadge>{count}</CountBadge>}
    </Tag>
  );
}
