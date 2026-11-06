"use client";

import { startTransition, useActionState } from "react";
import type { FormState } from "@/app/admin/actions";

/** Formulario que muestra el error o la confirmación que devuelve la acción (Next oculta los mensajes de las excepciones). */
export function ActionForm({
  action,
  submitLabel,
  children,
  className = "space-y-3",
  resetOnSuccess = false,
  buttonClassName = "btn",
  confirm,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  submitLabel: string;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  /** Clase del botón de envío (por defecto el botón principal). */
  buttonClassName?: string;
  /** Si se indica, pide confirmación al enviar. */
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState(async (prev: FormState, fd: FormData) => {
    const r = await action(prev, fd);
    return r;
  }, null);

  // Se envía a mano (en vez de `action={…}`): React 19 vacía los campos de un formulario al terminar su acción, y con eso
  // se perdía todo lo escrito cuando un campo era inválido. Así lo escrito se conserva y solo se limpia si resetOnSuccess.
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
      className={className}
      key={resetOnSuccess && state?.ok ? "ok" : "form"}
    >
      {children}
      {state?.error && (
        <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state?.ok && state.message && <p className="rounded-lg bg-green-50 p-2 text-sm text-green-800">{state.message}</p>}
      <button className={buttonClassName} disabled={pending}>
        {pending ? "Guardando…" : submitLabel}
      </button>
    </form>
  );
}
