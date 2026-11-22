"use client";

import { useEffect, useId, useRef, useState } from "react";
import { PasswordInput } from "./PasswordInput";

/**
 * Contraseña nueva + confirmación, con validación en tiempo real: mientras escribís avisa si no coinciden y, además,
 * bloquea el envío del formulario (validación nativa) hasta que coincidan. Los dos campos tienen ver/ocultar.
 */
export function PasswordPair({
  newName = "newPassword",
  confirmName = "confirmPassword",
  newLabel = "Contraseña",
  confirmLabel = "Confirmar contraseña",
  hint,
  autoFocus = false,
  onValue,
}: {
  newName?: string;
  confirmName?: string;
  newLabel?: string;
  confirmLabel?: string;
  hint?: string;
  autoFocus?: boolean;
  /** Si el formulario controla los valores (ej: el registro), recibe el par actual. */
  onValue?: (v: { password: string; confirm: string }) => void;
}) {
  const id = useId();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const confirmRef = useRef<HTMLInputElement>(null);
  const touched = confirm.length > 0;
  const mismatch = touched && pw !== confirm;
  const match = touched && pw === confirm && pw.length > 0;

  // Validación nativa: mientras no coincidan el formulario no se envía (se actualiza al escribir en cualquiera de los dos campos).
  useEffect(() => {
    confirmRef.current?.setCustomValidity(mismatch ? "Las contraseñas no coinciden." : "");
  }, [mismatch]);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor={`${id}-new`}>
          {newLabel}
        </label>
        <PasswordInput
          id={`${id}-new`}
          name={newName}
          required
          minLength={8}
          maxLength={100}
          autoComplete="new-password"
          autoFocus={autoFocus}
          value={pw}
          onChange={(e) => {
            setPw(e.target.value);
            onValue?.({ password: e.target.value, confirm });
          }}
        />
        {hint && <p className="mt-1 text-xs text-neutral-400">{hint}</p>}
      </div>
      <div>
        <label className="label" htmlFor={`${id}-confirm`}>
          {confirmLabel}
        </label>
        <PasswordInput
          id={`${id}-confirm`}
          ref={confirmRef}
          name={confirmName}
          required
          minLength={8}
          maxLength={100}
          autoComplete="new-password"
          value={confirm}
          aria-invalid={mismatch}
          aria-describedby={`${id}-msg`}
          onChange={(e) => {
            setConfirm(e.target.value);
            onValue?.({ password: pw, confirm: e.target.value });
          }}
          className={`input ${mismatch ? "!border-red-400" : match ? "!border-green-400" : ""}`}
        />
        <p id={`${id}-msg`} role="status" aria-live="polite" className={`mt-1 text-xs ${mismatch ? "text-red-600" : "text-green-700"}`}>
          {mismatch ? "Las contraseñas no coinciden." : match ? "Las contraseñas coinciden." : ""}
        </p>
      </div>
    </div>
  );
}