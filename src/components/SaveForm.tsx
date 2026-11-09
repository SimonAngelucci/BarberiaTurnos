"use client";

import { useEffect, useRef, useState } from "react";

type Status = { kind: "ok" | "error"; text: string } | null;

/**
 * Formulario para acciones del servidor que no devuelven nada (guardar horarios, servicios, ajustes…).
 * Lo envía a mano (React 19 vacía los campos al terminar un `action={…}` y la pantalla quedaba distinta de lo guardado),
 * bloquea el envío mientras guarda y avisa con un cartel claro: «Guardado ✓» o el error.
 * Con `resetOnSuccess` el formulario se vuelve a armar vacío (ej: «Nuevo servicio»).
 */
export function SaveForm({
  action,
  children,
  className,
  successText = "Guardado ✓",
  resetOnSuccess = false,
  confirm,
}: {
  action: (fd: FormData) => Promise<void>;
  children: React.ReactNode;
  className?: string;
  successText?: string;
  resetOnSuccess?: boolean;
  confirm?: string;
}) {
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [generation, setGeneration] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const show = (s: Status, ms: number) => {
    setStatus(s);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus(null), ms);
  };

  return (
    <form
      key={generation}
      className={`${className ?? ""} ${pending ? "pointer-events-none opacity-70" : ""}`}
      aria-busy={pending}
      onSubmit={async (e) => {
        e.preventDefault();
        if (pending) return;
        if (confirm && !window.confirm(confirm)) return;
        const fd = new FormData(e.currentTarget);
        setPending(true);
        setStatus(null);
        try {
          await action(fd);
          show({ kind: "ok", text: successText }, 3000);
          if (resetOnSuccess) setGeneration((g) => g + 1);
        } catch {
          // Next oculta el mensaje real de las excepciones en producción: se avisa algo claro y accionable.
          show({ kind: "error", text: "No se pudo guardar. Revisá los datos e intentá de nuevo." }, 6000);
        } finally {
          setPending(false);
        }
      }}
    >
      {children}
      {/* Cartel flotante: se ve aunque el botón esté lejos (en el celular, abajo de todo). */}
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-5 z-[60] flex justify-center px-4">
        {status && (
          <div className={`rounded-full px-5 py-2.5 text-sm font-semibold shadow-lg ${status.kind === "ok" ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>{status.text}</div>
        )}
      </div>
      {pending && <span className="sr-only">Guardando…</span>}
    </form>
  );
}
