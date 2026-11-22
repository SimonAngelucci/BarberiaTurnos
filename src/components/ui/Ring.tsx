/**
 * Anillo de progreso: el arco usa --primary-strong (profundo sobre claro, pastel sobre negro) y la pista el mismo color atenuado.
 * El número va en el centro; `label` (DÍAS, HORAS, MIN…) queda al lado en mayúsculas. `value` es de 0 a 1.
 * Es un gráfico decorativo: el dato real está en el texto (número + label), que lo leen los lectores de pantalla.
 */
export function Ring({ value, children, label, size = 40, stroke = 4, className = "" }: { value: number; children: React.ReactNode; label?: string; size?: number; stroke?: number; className?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.min(1, Math.max(0, value));
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.16} strokeWidth={stroke} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--primary-strong)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)} style={{ transition: "stroke-dashoffset .6s ease" }} />
        </svg>
        <span className="absolute text-[13px] font-semibold tabular-nums">{children}</span>
      </span>
      {label && <span className="text-[10px] font-semibold uppercase tracking-[0.12em]">{label}</span>}
    </span>
  );
}
