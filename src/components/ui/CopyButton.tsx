"use client";

import { useEffect, useRef, useState } from "react";
import { IconButton } from "./IconButton";

/** Copia un texto al portapapeles. El ícono pasa a un check por 1,5 s (y se anuncia «Copiado» a los lectores de pantalla). */
export function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  return (
    <>
      <IconButton
        icon={copied ? "check" : "copy"}
        label={copied ? "Copiado" : label}
        className={copied ? "!border-green-300 !text-green-700" : ""}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), 1500);
          } catch {
            /* sin permiso de portapapeles: el texto igual se puede seleccionar y copiar a mano */
          }
        }}
      />
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? "Copiado" : ""}
      </span>
    </>
  );
}