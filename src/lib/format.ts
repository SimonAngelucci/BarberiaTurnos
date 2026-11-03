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

/** CSS de variables del tema. Los colores se validan para que nunca se inyecte CSS arbitrario. */
export function themeCss(brand: string, bg: string) {
  const b = HEX.test(brand) ? brand : "#111827";
  const g = HEX.test(bg) ? bg : "#fafafa";
  return `:root{--brand:${b};--brand-fg:${contrastFg(b)};--page-bg:${g};--page-fg:${contrastFg(g)}}`;
}

/** Texto legible sobre el color de marca */
export function contrastFg(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#111827" : "#ffffff";
}
