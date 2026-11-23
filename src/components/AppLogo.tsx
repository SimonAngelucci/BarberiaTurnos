/**
 * Logo de la app de turnos. Es el ÚNICO lugar donde se define: el proyecto no traía un archivo de logo, así que esta es una
 * marca provisoria (un calendario con un tilde). Para usar el logo definitivo, reemplazá el contenido de este componente
 * (por ejemplo con un <img src="/logo.svg" />): se actualiza en todas las pantallas que lo usan.
 */
export function AppLogo({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="Turnos" className={`shrink-0 ${className}`}>
      <rect width="48" height="48" rx="12" fill="#242222" />
      <rect x="11" y="14" width="26" height="23" rx="4" fill="none" stroke="#fff" strokeWidth="2.4" />
      <path d="M11 21h26" stroke="#fff" strokeWidth="2.4" />
      <path d="M17 10v8M31 10v8" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <path d="m18.5 29.5 4 4 7.5-8" fill="none" stroke="#f8d05f" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
