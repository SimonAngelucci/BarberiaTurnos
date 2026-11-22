"use client";

import { usePathname } from "next/navigation";
import { SwipeShell } from "./SwipeShell";

/** Pantallas que ocupan todo el ancho por su cuenta, sin el menú ni los avisos del panel. */
const BARE = new Set(["/admin/login"]);

/**
 * Marco del panel. Decide qué mostrar según la ruta ACTUAL del navegador (usePathname) y no la que había al cargar la página:
 * en Next el layout se conserva al navegar, así que si esta decisión se tomara en el servidor, entrar directo a una pantalla
 * sin menú dejaba el layout guardado sin menú y no volvía a aparecer al regresar hasta recargar.
 *
 * - `chrome` (menú, avisos de suscripción, link público, guía) se oculta en las pantallas «bare».
 * - Las pestañas principales (`tabs`) se pueden recorrer deslizando (ver SwipeShell).
 * - En solo lectura se deshabilitan los formularios, salvo en Suscripción y Mi cuenta (tienen que seguir funcionando).
 */
export function PanelShell({ chrome, readonly, tabs, children }: { chrome: React.ReactNode; readonly: boolean; tabs: string[]; children: React.ReactNode }) {
  const path = usePathname() ?? "";
  const bare = BARE.has(path);
  const lock = readonly && !bare && !path.startsWith("/admin/billing") && !path.startsWith("/admin/account");

  return (
    <div className={`panel mx-auto min-h-screen px-4 pt-4 ${bare ? "pb-4" : "pb-32"} ${path === "/admin/turnos" ? "max-w-5xl" : "max-w-4xl"}`}>
      {!bare && chrome}
      <SwipeShell tabs={bare ? [] : tabs}>
        <fieldset disabled={lock} className="m-0 min-w-0 border-0 p-0">
          {children}
        </fieldset>
      </SwipeShell>
    </div>
  );
}
