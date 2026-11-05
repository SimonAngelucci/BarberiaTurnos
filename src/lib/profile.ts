import { z } from "zod";
import { parsePhoneNumberFromString } from "libphonenumber-js";

// Contenido de la página pública: validación y armado de links. Todo lo que el administrador (o un cliente, en el caso de
// las reseñas) escribe pasa por acá antes de guardarse, y los links se vuelven a construir al mostrarse, nunca se pegan crudos.

export const MAX_HERO_PHOTOS = 8;
export const MAX_GALLERY_PHOTOS = 24;
export const MAX_PENDING_REVIEWS = 30;

/** Quita caracteres de control (salvo saltos de línea) y normaliza saltos de línea. */
export const cleanText = (s: string) =>
  s
    .replace(/\r\n?/g, "\n")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();

const optText = (max: number) =>
  z
    .string()
    .max(max, `Máximo ${max} caracteres`)
    .transform(cleanText)
    .transform((v) => v || null);

// ------------------------------------------------------------------------------------------ teléfono / WhatsApp

/** Devuelve el número en formato internacional (E.164) o null si está vacío. Lanza si es inválido. */
export function normalizePhone(raw: string, label: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const p = parsePhoneNumberFromString(v, "AR");
  if (!p?.isValid()) throw new Error(`${label} inválido. Incluí el código de país si no es de Argentina (ej: +54 9 11 1234 5678).`);
  return p.number;
}

export const telHref = (e164: string) => `tel:${e164}`;
export const whatsappHref = (e164: string) => `https://wa.me/${e164.replace(/\D/g, "")}`;
export const prettyPhone = (e164: string) => parsePhoneNumberFromString(e164)?.formatInternational() ?? e164;

// ------------------------------------------------------------------------------------------ redes sociales

type Social = "instagram" | "facebook" | "tiktok" | "youtube";
const SOCIAL: Record<Social, { domain: RegExp; build: (handle: string) => string; label: string }> = {
  instagram: { domain: /(^|\.)instagram\.com$/, build: (h) => `https://www.instagram.com/${h}`, label: "Instagram" },
  facebook: { domain: /(^|\.)(facebook|fb)\.com$/, build: (h) => `https://www.facebook.com/${h}`, label: "Facebook" },
  tiktok: { domain: /(^|\.)tiktok\.com$/, build: (h) => `https://www.tiktok.com/@${h}`, label: "TikTok" },
  youtube: { domain: /(^|\.)youtube\.com$/, build: (h) => `https://www.youtube.com/@${h}`, label: "YouTube" },
};
export const SOCIAL_LABELS: Record<Social | "website", string> = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", youtube: "YouTube", website: "Sitio web" };

/** Acepta @usuario, usuario o el link completo. Devuelve siempre un https:// de la red elegida (o null si está vacío). */
export function normalizeSocial(kind: Social, raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const spec = SOCIAL[kind];
  // Es un link si trae https://, una barra o empieza con un dominio (www.…, algo.com…). Un usuario con puntos (mi.barberia) no lo es.
  if (/^https?:\/\//i.test(v) || v.includes("/") || /^(www\.|[a-z0-9-]+\.(com|net|org|me|be|tv)(\b|$))/i.test(v)) {
    const url = parseHttpUrl(v);
    if (!url || !spec.domain.test(url.hostname.toLowerCase())) throw new Error(`El link de ${spec.label} no parece válido. Pegá el link de tu perfil o solo tu @usuario.`);
    return url.toString();
  }
  const handle = v.replace(/^@/, "");
  if (!/^[A-Za-z0-9._-]{1,50}$/.test(handle)) throw new Error(`El usuario de ${spec.label} no es válido.`);
  return spec.build(handle);
}

/** Sitio web propio: http(s) obligatorio (se agrega https:// si falta). */
export function normalizeWebsite(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const url = parseHttpUrl(v);
  if (!url || !url.hostname.includes(".")) throw new Error("El sitio web no parece válido (ej: https://mibarberia.com).");
  return url.toString();
}

function parseHttpUrl(v: string): URL | null {
  try {
    const url = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------------------------------ Google Maps

const MAPS_HOST = /^(?:(?:www|maps)\.)?google\.[a-z]{2,3}(?:\.[a-z]{2})?$|^maps\.app\.goo\.gl$|^goo\.gl$/i;

/** Solo links de Google Maps (incluye los cortos). Devuelve null si está vacío; lanza si es de otro sitio. */
export function normalizeMapsUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const url = parseHttpUrl(v);
  const host = url?.hostname.toLowerCase() ?? "";
  const ok = !!url && url.protocol === "https:" && MAPS_HOST.test(host) && (host.endsWith("goo.gl") || host.startsWith("maps.") || url.pathname.startsWith("/maps"));
  if (!ok) throw new Error("El link de ubicación tiene que ser de Google Maps (en Maps tocá «Compartir» → «Copiar link»).");
  return url!.toString();
}

/** Link de «Cómo llegar»: el cargado por el administrador o, si falta, una búsqueda de Google Maps con la dirección. */
export const mapsHref = (mapsUrl: string | null, address: string | null) =>
  mapsUrl ?? (address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null);

// ------------------------------------------------------------------------------------------ esquemas de formularios

export const aboutSchema = z.object({
  aboutTitle: optText(80),
  aboutText: optText(2000),
  policyText: optText(2000),
});

export const contactSchema = z.object({
  phone: z.string().max(30).default(""),
  whatsapp: z.string().max(30).default(""),
  email: z
    .string()
    .trim()
    .max(120)
    .refine((v) => v === "" || z.string().email().safeParse(v).success, "El email no es válido")
    .default(""),
  address: optText(200).default(""),
  mapsUrl: z.string().max(500).default(""),
  instagram: z.string().max(200).default(""),
  facebook: z.string().max(200).default(""),
  tiktok: z.string().max(200).default(""),
  youtube: z.string().max(200).default(""),
  website: z.string().max(200).default(""),
});

export const reviewFields = {
  authorName: z.string().transform(cleanText).pipe(z.string().min(2, "Poné tu nombre").max(40, "El nombre es muy largo (máx. 40)")),
  rating: z.coerce.number().int("Elegí una puntuación").min(1, "Elegí una puntuación").max(5, "Elegí una puntuación"),
  comment: z.string().transform(cleanText).pipe(z.string().min(5, "Contanos un poco más (mínimo 5 caracteres)").max(500, "El comentario es muy largo (máx. 500)")),
};
export const reviewSchema = z.object(reviewFields);
