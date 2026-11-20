"use client";

import { usePathname } from "next/navigation";

/** Pantallas que ocupan todo el ancho por su cuenta, sin el menú ni los avisos del panel. */
const BARE = new Set(["/admin/login", "/admin/turnos"]);

/**
 * Marco del panel. Decide qué mostrar según la ruta ACTUAL del navegador (usePathname) y no la que había al cargar la página:
 * en Next el layout se conserva al navegar, así que si esta decisión se tomara en el servidor, entrar directo a «En vivo»
 * dejaba el layout guardado sin menú y no volvía a aparecer al regresar hasta recargar.
 *
 * - `chrome` (menú, avisos de suscripción, link público, guía) se oculta en las pantallas «bare».
 * - En solo lectura se deshabilitan los formularios, salvo en Suscripción y Mi cuenta (tienen que seguir funcionando).
 */
export function PanelShell({ chrome, readonly, children }: { chrome: React.ReactNode; readonly: boolean; children: React.ReactNode }) {
  const path = usePathname() ?? "";
  const bare = BARE.has(path);
  const lock = readonly && !bare && !path.startsWith("/admin/billing") && !path.startsWith("/admin/account");

  return (
    <div className={`mx-auto min-h-screen px-4 py-4 ${path === "/admin/turnos" ? "max-w-5xl" : "max-w-4xl"}`}>
      {!bare && chrome}
      <fieldset disabled={lock} className="m-0 min-w-0 border-0 p-0">
        {children}
      </fieldset>
    </div>
  );
}
