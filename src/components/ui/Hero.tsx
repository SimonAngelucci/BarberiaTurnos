"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Bloque de color de arriba de la pantalla (acento con la esquina inferior curva). Su fondo sube hasta el borde superior del
 * panel, por detrás de la barra de arriba y de los avisos, así que todo lo de arriba queda "dentro" del bloque; el contenido
 * (tabs, anillos…) va dentro de este componente y el fondo termina justo debajo de él. Solo para pantallas con encabezado de color.
 */
export function Hero({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLDivElement>(null);

  // Mide cuánto hay entre el borde superior del panel y este bloque (barra, avisos…) y estira el fondo hasta ahí.
  useLayoutEffect(() => {
    const w = wrap.current;
    const b = back.current;
    const root = w?.closest(".panel") as HTMLElement | null;
    if (!w || !b || !root) return;
    const fit = () => {
      b.style.top = `${-(w.getBoundingClientRect().top - root.getBoundingClientRect().top)}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(root);
    ro.observe(w);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrap} className={`relative pb-6 ${className}`}>
      <div ref={back} aria-hidden className="hero-block absolute -inset-x-4 bottom-0 -z-10" style={{ top: "-7rem" }} />
      {children}
    </div>
  );
}
