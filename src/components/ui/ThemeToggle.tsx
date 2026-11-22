"use client";

import { useEffect, useState } from "react";
import { applyPref, readPref, savePref, type ThemePref } from "@/lib/theme";
import { Icon, type IconName } from "./Icon";
import { IconButton } from "./IconButton";

const OPTIONS: { value: ThemePref; label: string; icon: IconName }[] = [
  { value: "light", label: "Claro", icon: "sun" },
  { value: "dark", label: "Oscuro", icon: "moon" },
  { value: "system", label: "Sistema", icon: "monitor" },
];

/** Mantiene la preferencia sincronizada: reacciona a cambios del sistema (en modo «sistema») y a otras pestañas. */
function usePref() {
  const [pref, setPref] = useState<ThemePref>("system");
  useEffect(() => {
    setPref(readPref());
    const onChange = () => setPref(readPref());
    window.addEventListener("theme-pref-change", onChange);
    window.addEventListener("storage", onChange);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystem = () => readPref() === "system" && applyPref("system");
    mq.addEventListener("change", onSystem);
    return () => {
      window.removeEventListener("theme-pref-change", onChange);
      window.removeEventListener("storage", onChange);
      mq.removeEventListener("change", onSystem);
    };
  }, []);
  return pref;
}

/** Selector completo (claro / oscuro / sistema), para Mi cuenta. */
export function ThemeToggle() {
  const pref = usePref();
  return (
    <div role="radiogroup" aria-label="Tema de la aplicación" className="inline-flex rounded-xl border border-neutral-300 bg-white p-1">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={pref === o.value}
          onClick={() => savePref(o.value)}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${pref === o.value ? "bg-brand text-brand-fg" : "text-neutral-600 hover:bg-neutral-100"}`}
        >
          <Icon name={o.icon} size={16} />
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Botón compacto que rota entre claro → oscuro → sistema (para barras de navegación). */
export function ThemeCycleButton() {
  const pref = usePref();
  const next = OPTIONS[(OPTIONS.findIndex((o) => o.value === pref) + 1) % OPTIONS.length];
  const cur = OPTIONS.find((o) => o.value === pref) ?? OPTIONS[2];
  return <IconButton icon={cur.icon} label={`Tema: ${cur.label}. Cambiar a ${next.label}`} onClick={() => savePref(next.value)} className="!border-transparent !bg-transparent" />;
}