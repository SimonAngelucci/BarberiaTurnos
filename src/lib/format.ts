import { DateTime } from "luxon";

export const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);

export const fmtDateTime = (d: Date, tz: string) =>
  DateTime.fromJSDate(d).setZone(tz).setLocale("es").toFormat("ccc d LLL · HH:mm");

export const fmtTime = (d: Date, tz: string) => DateTime.fromJSDate(d).setZone(tz).toFormat("HH:mm");

export const minToHHMM = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export const hhmmToMin = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};

/** "hasta 2 horas antes del turno" — para mensajes y pantallas. */
export function noticePhrase(min: number) {
  if (min <= 0) return "hasta el momento del turno";
  const days = min / 1440;
  if (Number.isInteger(days)) return `hasta ${days} ${days === 1 ? "día" : "días"} antes del turno`;
  const hours = min / 60;
  if (Number.isInteger(hours)) return `hasta ${hours} ${hours === 1 ? "hora" : "horas"} antes del turno`;
  return `hasta ${min} minutos antes del turno`;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
export const isHex = (v: string) => HEX.test(v);

// ---- utilidades de color (puras): luminancia WCAG, contraste, y variantes para hover y modo oscuro
const toRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = ([r, g, b]: [number, number, number]) => "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const luminance = (hex: string) => {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** Relación de contraste WCAG entre dos colores (1 a 21). */
export const contrastRatio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** Mezcla `hex` con `toward` (0 = hex, 1 = toward). */
const mix = (hex: string, toward: string, amount: number) => {
  const [a, b] = [toRgb(hex), toRgb(toward)];
  return toHex([a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount, a[2] + (b[2] - a[2]) * amount]);
};

/** Fondo del panel en modo oscuro (ver globals.css). */
const DARK_SURFACE = "#161616";

/**
 * Versión del color de marca para fondos oscuros: si el original no se distingue del fondo (ej: el negro por defecto), se lo
 * aclara hasta tener al menos 4,5:1 de contraste; si ya se ve bien, queda igual.
 */
export function brandOnDark(hex: string) {
  let c = hex;
  for (let i = 0; i < 20 && contrastRatio(c, DARK_SURFACE) < 4.5; i++) c = mix(c, "#ffffff", 0.12);
  return c;
}

/**
 * CSS de variables del tema. Los colores se validan para que nunca se inyecte CSS arbitrario.
 * - --brand / --color-primary: el color principal; --color-primary-hover: un poco más oscuro; --color-primary-fg: texto legible encima.
 * - --brand-dark*: las mismas variantes ya adaptadas al modo oscuro (se activan en globals.css bajo html[data-theme="dark"]).
 */
export function themeCss(brand: string, bg: string) {
  const b = HEX.test(brand) ? brand : "#111827";
  const g = HEX.test(bg) ? bg : "#fafafa";
  const hover = mix(b, "#000000", 0.14);
  const bd = brandOnDark(b);
  const bdHover = mix(bd, "#ffffff", 0.12);
  return (
    `:root{--brand:${b};--brand-fg:${contrastFg(b)};--color-primary:${b};--color-primary-hover:${hover};--color-primary-fg:${contrastFg(b)};` +
    `--brand-dark:${bd};--brand-dark-fg:${contrastFg(bd)};--brand-dark-hover:${bdHover};--page-bg:${g};--page-fg:${contrastFg(g)}}`
  );
}

/** Texto legible sobre un color: el de mayor contraste WCAG entre blanco y el oscuro de la app (siempre >= 4,2:1, incluso en tonos medios). */
export function contrastFg(hex: string) {
  return contrastRatio(hex, "#ffffff") >= contrastRatio(hex, "#111827") ? "#ffffff" : "#111827";
}

/** Amarillo de la app (el de la referencia). El panel de administración lo usa siempre. */
export const DEFAULT_PRIMARY = "#f8d05f";

/** El panel de administración no cambia de color con el negocio: se conserva la función por compatibilidad. */
export function panelThemeCss(_brand?: string) {
  return "";
}

/**
 * Color propio del negocio (opcional, apagado por defecto): reemplaza SOLO al acento (--primary) en la web pública de reservas.
 * El texto encima se elige por contraste. Los colores se validan para no inyectar CSS arbitrario.
 */
export function ownColorCss(brand: string) {
  if (!HEX.test(brand)) return "";
  const strong = luminance(brand) > 0.4 ? mix(brand, "#000000", 0.35) : brand;
  const pd = brandOnDark(brand);
  return `.app-themed{--primary:${brand};--on-primary:${contrastFg(brand)};--primary-strong:${strong};--primary-dark:${pd};--on-primary-dark:${contrastFg(pd)};--primary-strong-dark:${pd}}`;
}