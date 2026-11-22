/**
 * Bloque de color de arriba de la pantalla (acento con esquina inferior curva). Se estira hasta los bordes del contenedor
 * de la página (-mx-4) y su contenido va dentro: encabezado, tabs, anillos, etc.
 */
export function Hero({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`hero-block -mx-4 px-4 pb-6 pt-1 ${className}`}>{children}</div>;
}
