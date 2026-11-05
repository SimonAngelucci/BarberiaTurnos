import type { ReactNode } from "react";
import { FONTS, type PageConfig } from "@/lib/page-config";

/**
 * Contenedor de una sección de la página pública. Usa el mismo ancho máximo, tipografía y radio de tarjetas que configuró la
 * barbería en el editor de diseño, así las secciones nuevas se ven como parte de la misma página.
 */
export function SiteSection({ id, title, config, children }: { id?: string; title?: string; config: PageConfig; children: ReactNode }) {
  return (
    <section
      id={id}
      className="mx-auto w-full scroll-mt-14 px-4 py-6"
      style={{
        maxWidth: Math.max(config.global.maxWidth, 640),
        fontFamily: FONTS[config.global.font].css,
        ["--card-radius" as string]: `${config.global.cardRadius}px`,
      }}
    >
      {title && <h2 className="mb-3 text-xl font-bold">{title}</h2>}
      {children}
    </section>
  );
}
