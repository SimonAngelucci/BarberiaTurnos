import { iconPaths, type BusinessType } from "@/lib/service-icons";

/**
 * Ícono de un servicio dentro de un círculo. Si el negocio subió uno propio se muestra esa imagen; si no, el dibujo elegido
 * (o el predeterminado de su rubro). Sirve igual en el panel y en la página pública.
 */
export function ServiceIcon({
  iconKey,
  iconUrl,
  type,
  size = 44,
  className = "",
}: {
  iconKey?: string | null;
  iconUrl?: string | null;
  type: BusinessType;
  size?: number;
  className?: string;
}) {
  const box = { width: size, height: size };
  if (iconUrl) {
    return (
      <span aria-hidden style={box} className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-100 ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={iconUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
      </span>
    );
  }
  return (
    <span aria-hidden style={box} className={`flex shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-700 ${className}`}>
      <svg viewBox="0 0 24 24" style={{ width: size * 0.5, height: size * 0.5 }} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {iconPaths(iconKey, type).map((d, i) => (
          <path key={i} d={d} />
        ))}
      </svg>
    </span>
  );
}
