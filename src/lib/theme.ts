/** Preferencia de tema (claro / oscuro / sistema), guardada en localStorage. Todos los accesos van en try/catch (modo privado, storage bloqueado). */
export type ThemePref = "light" | "dark" | "system";
export const THEME_KEY = "theme-pref";

export function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function systemPrefersDark() {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

/** Aplica la preferencia al <html> (data-theme="light" | "dark"). */
export function applyPref(pref: ThemePref) {
  const dark = pref === "dark" || (pref === "system" && systemPrefersDark());
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function savePref(pref: ThemePref) {
  try {
    if (pref === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {
    /* sin storage: el cambio vale para esta visita */
  }
  applyPref(pref);
  window.dispatchEvent(new CustomEvent("theme-pref-change", { detail: pref }));
}

/**
 * Script que corre en el <head> ANTES de pintar la página: fija el tema desde la preferencia guardada para que no se vea un
 * destello del tema equivocado al cargar. Tiene que ser autosuficiente (se inyecta como texto).
 */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_KEY}");var d=p==="dark"||((p!=="light")&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light"}catch(e){}})()`;