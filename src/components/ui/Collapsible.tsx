"use client";

import { useId, useState } from "react";
import { Icon } from "./Icon";

/**
 * Bloque desplegable reutilizable (acordeón). El encabezado es un botón con aria-expanded/aria-controls (Enter y Espacio lo
 * abren), y el contenido se anima con una transición de alto suave (se desactiva con «reducir movimiento»).
 *
 * El contenido queda siempre montado: lo que se escribió en un formulario no se pierde al cerrar y volver a abrir. Cerrado,
 * se marca como `inert` para que no reciba foco ni lo lean los lectores de pantalla.
 */
export function Collapsible({
  title,
  summary,
  leading,
  trailing,
  defaultOpen = false,
  className = "",
  headerClassName = "",
  children,
}: {
  title: React.ReactNode;
  /** Línea chica debajo del título (se ve también cerrado). */
  summary?: React.ReactNode;
  /** Algo a la izquierda del título (ícono, avatar). */
  leading?: React.ReactNode;
  /** Algo a la derecha, antes de la flechita (etiquetas). */
  trailing?: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  headerClassName?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const panel = `${id}-panel`;
  const button = `${id}-button`;

  return (
    <div className={className}>
      <h3 className="m-0">
        <button
          id={button}
          type="button"
          aria-expanded={open}
          aria-controls={panel}
          onClick={() => setOpen((o) => !o)}
          className={`flex w-full items-center gap-3 rounded-xl text-left outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand ${headerClassName}`}
        >
          {leading}
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{title}</span>
            {summary && <span className="block text-sm font-normal text-neutral-500">{summary}</span>}
          </span>
          {trailing}
          <Icon name="chevron-down" className={`text-neutral-400 transition-transform duration-300 motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
        </button>
      </h3>
      <div
        id={panel}
        role="region"
        aria-labelledby={button}
        inert={!open}
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
      >
        <div className="overflow-hidden">
          <div className="pt-3">{children}</div>
        </div>
      </div>
    </div>
  );
}
