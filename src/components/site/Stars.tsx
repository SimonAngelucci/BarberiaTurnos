import { Icon } from "@/components/ui/Icon";

/** Estrellas de puntuación (1 a 5). Acepta promedios con decimales: se redondea para dibujarlas y el valor exacto va en el texto accesible. */
export function Stars({ value, className = "", size = 16 }: { value: number; className?: string; size?: number }) {
  const full = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span role="img" aria-label={`${Number.isInteger(value) ? value : value.toFixed(1)} de 5 estrellas`} className={`inline-flex items-center gap-0.5 leading-none ${className}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon key={n} name="star" size={size} className={n <= full ? "fill-amber-500 text-amber-500" : "fill-neutral-200 text-neutral-300"} />
      ))}
    </span>
  );
}