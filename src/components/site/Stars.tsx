/** Estrellas de puntuación (1 a 5). Acepta promedios con decimales: se redondea para dibujarlas y el valor exacto va en el texto accesible. */
export function Stars({ value, className = "text-base" }: { value: number; className?: string }) {
  const full = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span role="img" aria-label={`${Number.isInteger(value) ? value : value.toFixed(1)} de 5 estrellas`} className={`inline-block leading-none tracking-wide ${className}`}>
      <span className="text-amber-500">{"★".repeat(full)}</span>
      <span className="text-neutral-300">{"★".repeat(5 - full)}</span>
    </span>
  );
}
