"use client";

import { useState } from "react";
import { Icon } from "./Icon";

/** Campo de contraseña con botón para ver u ocultar lo escrito (ícono de ojo lineal, con aria-label y aria-pressed). */
export function PasswordInput({
  className = "input",
  ...props
}: Omit<React.ComponentProps<"input">, "type">) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={show ? "text" : "password"} className={`${className} pr-11`} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
        aria-pressed={show}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-neutral-500 hover:text-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
      >
        <Icon name={show ? "eye-off" : "eye"} size={18} />
      </button>
    </div>
  );
}