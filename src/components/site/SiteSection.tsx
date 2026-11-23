import type { ReactNode } from "react";
import { SectionLabel } from "@/components/ui/SectionLabel";

/** Sección de la columna principal: etiqueta en mayúsculas (con contador opcional) y contenido. */
export function SiteSection({ id, title, count, center = false, children }: { id?: string; title?: string; count?: number | string; center?: boolean; children: ReactNode }) {
  return (
    <section id={id} className={`scroll-mt-16 ${center ? "text-center" : ""}`}>
      {title && (
        <SectionLabel count={count} className={`mb-4 ${center ? "justify-center" : ""}`}>
          {title}
        </SectionLabel>
      )}
      {children}
    </section>
  );
}