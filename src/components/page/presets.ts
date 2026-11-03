import type { TextBlock } from "@/lib/page-config";

/** Combinaciones de lettering listas para usar. Todos los valores respetan los rangos del esquema. */
export type TextPreset = { key: string; label: string; tileBg: string; tileFg: string; values: Partial<TextBlock> };

const base = { fx: "none", rotate: 0, tracking: 0, caps: false } as const;

export const TEXT_PRESETS: TextPreset[] = [
  { key: "neon", label: "Neón", tileBg: "#0b1020", tileFg: "#ffffff", values: { ...base, font: "bungee", weight: 400, color: "#ffffff", fx: "neon", fxColor: "#ff2d95", caps: true, tracking: 2 } },
  { key: "retro", label: "Retro 3D", tileBg: "#0f172a", tileFg: "#fde047", values: { ...base, font: "bungee", weight: 400, color: "#fde047", fx: "retro3d", fxColor: "#e11d48", caps: true, tracking: 1 } },
  { key: "graffiti", label: "Graffiti", tileBg: "#7c3aed", tileFg: "#ffffff", values: { ...base, font: "marker", weight: 400, color: "#ffffff", fx: "shadow", fxColor: "#111827", rotate: -4 } },
  { key: "sello", label: "Sello", tileBg: "#fef3c7", tileFg: "#dc2626", values: { ...base, font: "blackops", weight: 400, color: "#dc2626", fx: "stamp", caps: true, tracking: 3, rotate: -3 } },
  { key: "contorno", label: "Contorno", tileBg: "#111827", tileFg: "#f59e0b", values: { ...base, font: "anton", weight: 400, color: "#f59e0b", fx: "outline", caps: true, tracking: 2 } },
  { key: "degrade", label: "Degradé", tileBg: "#fff7ed", tileFg: "#f97316", values: { ...base, font: "pacifico", weight: 400, color: "#f97316", fx: "gradient", fxColor: "#db2777" } },
  { key: "comic", label: "Cómic", tileBg: "#2563eb", tileFg: "#fde047", values: { ...base, font: "bangers", weight: 400, color: "#fde047", fx: "shadow", fxColor: "#111827", caps: true, tracking: 2, rotate: -2 } },
  { key: "maquina", label: "Máquina", tileBg: "#f5f5f4", tileFg: "#1c1917", values: { ...base, font: "typewriter", weight: 400, color: "#1c1917", tracking: 1 } },
  { key: "editorial", label: "Editorial", tileBg: "#fafafa", tileFg: "#111827", values: { ...base, font: "abril", weight: 400, color: "#111827", tracking: 1 } },
];

/** Quita todo el lettering especial y vuelve a un texto simple (no cambia la fuente ni el tamaño). */
export const CLEAR_FX: Partial<TextBlock> = { fx: "none", rotate: 0, tracking: 0, caps: false };
