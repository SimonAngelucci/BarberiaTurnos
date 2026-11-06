import type { ReactNode } from "react";

/** Sección de la columna principal: título limpio y contenido. El ancho, la tipografía y el radio los fija el contenedor de la página. */
export function SiteSection({ id, title, children }: { id?: string; title?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-16">
      {title && <h2 className="mb-3 text-xl font-bold tracking-tight">{title}</h2>}
      {children}
    </section>
  );
}
