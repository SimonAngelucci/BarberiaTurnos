/**
 * Íconos de servicios. Cada rubro trae su lista sugerida; además hay unos generales y se puede subir uno propio (Service.iconUrl).
 * Los dibujos son trazos simples en una grilla de 24×24 (se pintan con el color del texto, así se adaptan a cualquier tema).
 */
export const BUSINESS_TYPES = {
  BARBER: "Barbería",
  TATTOO: "Tatuajes",
  NAILS: "Uñas",
} as const;
export type BusinessType = keyof typeof BUSINESS_TYPES;

export function asBusinessType(v: string | null | undefined): BusinessType {
  return v && v in BUSINESS_TYPES ? (v as BusinessType) : "BARBER";
}

type Def = { label: string; paths: string[] };

const ICONS: Record<string, Def> = {
  // Barbería
  scissors: { label: "Corte de cabello", paths: ["M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z", "M6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z", "M20 4 8.1 15.9", "M14.5 14.5 20 20", "M8.1 8.1 12 12"] },
  beard: { label: "Barba", paths: ["M4 9c0 6 2 11 8 11s8-5 8-11", "M4 9c2 1 4 1 8 1s6 0 8-1", "M9 15c1 .8 2 1 3 1s2-.2 3-1"] },
  razor: { label: "Afeitado", paths: ["M3 8h14v5H3z", "M17 10h4", "M6 13v3", "M10 13v3", "M14 13v3"] },
  comb: { label: "Peinado", paths: ["M3 8h18v4H3z", "M5 12v4", "M8 12v4", "M11 12v4", "M14 12v4", "M17 12v4", "M20 12v4"] },
  shampoo: { label: "Lavado de cabeza", paths: ["M12 3c3 4 5 6.5 5 9.5a5 5 0 0 1-10 0C7 9.500 9 7 12 3Z", "M9.500 13.500a2.500 2.500 0 0 0 2.500 2.500"] },
  eyebrow: { label: "Cejas", paths: ["M3 14c3-5 9-7 18-3", "M6 17c2-2 6-3 12-1"] },
  clipper: { label: "Máquina de corte", paths: ["M8 3h8v12a4 4 0 0 1-8 0z", "M8 7h8", "M12 19v2"] },
  mustache: { label: "Bigote", paths: ["M2 14c2-4 6-5 10-2 4-3 8-2 10 2-3-1-6 0-10 3-4-3-7-4-10-3Z"] },
  // Tatuajes
  "tattoo-machine": { label: "Máquina de tatuar", paths: ["M9 3h6v5H9z", "M12 8v3", "M7 11h10v4H7z", "M12 15v6", "M17 13h3"] },
  "tattoo-design": { label: "Diseño", paths: ["M4 20l1-4L16 5l3 3L8 19z", "M14 7l3 3", "M4 20h4"] },
  ink: { label: "Tinta", paths: ["M12 3c3 4 5 6.500 5 9.500a5 5 0 0 1-10 0C7 9.500 9 7 12 3Z"] },
  needle: { label: "Aguja", paths: ["M4 20 18 6", "M16 4l4 4", "M4 20l2-5 3 3z"] },
  skull: { label: "Calavera", paths: ["M12 3a8 8 0 0 0-5 14v3h10v-3a8 8 0 0 0-5-14Z", "M9.500 12a1 1 0 1 0 0 .01", "M14.500 12a1 1 0 1 0 0 .01", "M10 20v-2", "M14 20v-2"] },
  rose: { label: "Flor", paths: ["M12 10a3 3 0 1 0 0 .01", "M12 7c-1-3-5-3-5 0s2 4 5 4c3 0 5-1 5-4s-4-3-5 0Z", "M12 11v10", "M12 16c2-2 4-2 5-1"] },
  // Uñas
  "nail-polish": { label: "Esmalte", paths: ["M8 11h8v9a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2z", "M10 11V6h4v5", "M11 6V3h2v3"] },
  manicure: { label: "Manicura", paths: ["M8 21v-8l-2-3a1.500 1.500 0 0 1 2.500-1.500L10 10V4a1.500 1.500 0 0 1 3 0v5V3.500a1.500 1.500 0 0 1 3 0V9V5.500a1.500 1.500 0 0 1 3 0V15a6 6 0 0 1-6 6z"] },
  pedicure: { label: "Pedicura", paths: ["M9 3c-2 0-3 2-3 5 0 2 1 3 1 5s-1 3-1 5a3 3 0 0 0 3 3h3a4 4 0 0 0 4-4v-3c0-4-2-11-7-11Z", "M17 6a1 1 0 1 0 0 .01", "M20 9a1 1 0 1 0 0 .01"] },
  "nail-file": { label: "Limado", paths: ["M4 20 18 6a2.100 2.100 0 0 1 3 3L7 23", "M6 16l3 3"] },
  gem: { label: "Decoración", paths: ["M6 4h12l3 5-9 11L3 9z", "M3 9h18", "M9 4l-1 5 4 11", "M15 4l1 5-4 11"] },
  // Generales (valen para cualquier rubro)
  sparkles: { label: "Destacado", paths: ["M12 3l1.800 5.200L19 10l-5.200 1.800L12 17l-1.800-5.200L5 10l5.200-1.800z", "M19 16v4", "M17 18h4"] },
  star: { label: "Estrella", paths: ["M12 3l2.800 5.800 6.200.9-4.500 4.400 1.100 6.200L12 17.300 6.400 20.300l1.100-6.200L3 9.700l6.200-.9z"] },
  heart: { label: "Corazón", paths: ["M12 20s-8-5-8-11a4.500 4.500 0 0 1 8-2.800A4.500 4.500 0 0 1 20 9c0 6-8 11-8 11Z"] },
  gift: { label: "Combo / promo", paths: ["M4 9h16v4H4z", "M5 13h14v8H5z", "M12 9v12", "M12 9C9 9 8 4 11 4c2 0 1 5 1 5Zm0 0c3 0 4-5 1-5-2 0-1 5-1 5Z"] },
  clock: { label: "Rápido", paths: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z", "M12 7v5l3 2"] },
};

/** Lista de íconos que se ofrece para cada rubro: primero los propios y después los generales. */
const BY_TYPE: Record<BusinessType, string[]> = {
  BARBER: ["scissors", "beard", "razor", "comb", "shampoo", "eyebrow", "clipper", "mustache"],
  TATTOO: ["tattoo-machine", "tattoo-design", "ink", "needle", "skull", "rose"],
  NAILS: ["nail-polish", "manicure", "pedicure", "nail-file", "gem"],
};
const GENERAL = ["sparkles", "star", "heart", "gift", "clock"];

export const DEFAULT_ICON: Record<BusinessType, string> = { BARBER: "scissors", TATTOO: "tattoo-machine", NAILS: "nail-polish" };

export function iconChoices(type: BusinessType) {
  return [...BY_TYPE[type], ...GENERAL].map((key) => ({ key, label: ICONS[key].label }));
}

export function isIconKey(k: string | null | undefined): k is string {
  return !!k && k in ICONS;
}

/** Dibujo a usar: el elegido si existe; si no (o si cambió el rubro y ya no está), el predeterminado del rubro. */
export function iconPaths(key: string | null | undefined, type: BusinessType): string[] {
  return ICONS[isIconKey(key) ? key : DEFAULT_ICON[type]].paths;
}

export function iconLabel(key: string) {
  return ICONS[key]?.label ?? key;
}
