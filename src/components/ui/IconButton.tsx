import type { ButtonHTMLAttributes } from "react";
import { Icon, type IconName } from "./Icon";

/**
 * Botón que es solo un ícono. Siempre lleva `label`: es su aria-label (lo leen los lectores de pantalla) y también el tooltip
 * que aparece en pantallas grandes al pasar el mouse o enfocar con el teclado (en el celular no se muestra, no hay hover).
 */
export function IconButton({
  icon,
  label,
  variant = "ghost",
  size = 18,
  className = "",
  type = "button",
  ...rest
}: { icon: IconName; label: string; variant?: "ghost" | "danger"; size?: number } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "children">) {
  const tone = variant === "danger" ? "border-red-200 text-red-600 hover:bg-red-50" : "border-neutral-300 text-neutral-700 hover:bg-neutral-100";
  return (
    <span className="group relative inline-flex">
      <button
        type={type}
        aria-label={label}
        {...rest}
        className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border bg-white/70 transition disabled:opacity-40 ${tone} ${className}`}
      >
        <Icon name={icon} size={size} />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute -top-8 left-1/2 z-40 -translate-x-1/2 whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-xs font-medium text-white opacity-0 shadow transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 max-sm:hidden"
      >
        {label}
      </span>
    </span>
  );
}