"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireWritable, ReadOnlyError } from "@/lib/guard";
import { deleteImage, isOwnBlobUrl } from "@/lib/upload";
import {
  MAX_GALLERY_PHOTOS,
  MAX_HERO_PHOTOS,
  aboutSchema,
  cleanText,
  normalizeMapsUrl,
  normalizePhone,
  normalizeSocial,
  normalizeWebsite,
  reviewSchema,
} from "@/lib/profile";
import type { FormState } from "../actions";

// Todas las acciones son endpoints públicos: SIEMPRE se valida la sesión (y que la cuenta esté al día) y se filtra por la
// barbería de la sesión, nunca por un id que mande el navegador. Los errores se devuelven como dato (en producción Next
// oculta el mensaje de las excepciones).

const firstError = (e: z.ZodError) => e.issues[0]?.message ?? "Datos inválidos";
const fail = (error: string): FormState => ({ ok: false, error });
const refresh = () => revalidatePath("/admin/profile");

async function session() {
  try {
    return { s: await requireWritable() };
  } catch (e) {
    if (e instanceof ReadOnlyError) return { error: e.message };
    throw e;
  }
}

// ------------------------------------------------------------------------------------------ textos

export async function saveAbout(_p: FormState, fd: FormData): Promise<FormState> {
  const g = await session();
  if (!g.s) return fail(g.error!);
  const parsed = aboutSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail(firstError(parsed.error));
  const { businessId } = g.s;
  await prisma.businessProfile.upsert({ where: { businessId }, create: { businessId, ...parsed.data }, update: parsed.data });
  refresh();
  return { ok: true, message: "Guardado." };
}

// ------------------------------------------------------------------------------------------ contacto, redes y ubicación

export async function saveContact(_p: FormState, fd: FormData): Promise<FormState> {
  const g = await session();
  if (!g.s) return fail(g.error!);
  const { businessId } = g.s;
  const raw = (k: string, max: number) => {
    const v = fd.get(k);
    return typeof v === "string" ? v.slice(0, max) : "";
  };

  // Cada campo se valida por separado: los vacíos se guardan vacíos (esa parte no se muestra) y los válidos se guardan siempre.
  // Si alguno es inválido se conserva lo que tenía antes ese campo y se avisa cuál corregir; no se pierde nada de lo demás.
  const data: Record<string, string | null> = {};
  const errors: string[] = [];
  const set = (key: string, fn: () => string | null) => {
    try {
      data[key] = fn();
    } catch (e) {
      errors.push(e instanceof Error ? e.message : `El campo ${key} no es válido.`);
    }
  };
  set("phone", () => normalizePhone(raw("phone", 30), "El teléfono"));
  set("whatsapp", () => normalizePhone(raw("whatsapp", 30), "El WhatsApp"));
  set("email", () => {
    const v = raw("email", 120).trim();
    if (v && !z.string().email().safeParse(v).success) throw new Error("El email no es válido.");
    return v || null;
  });
  set("address", () => cleanText(raw("address", 200)) || null);
  set("mapsUrl", () => normalizeMapsUrl(raw("mapsUrl", 500)));
  set("instagram", () => normalizeSocial("instagram", raw("instagram", 200)));
  set("facebook", () => normalizeSocial("facebook", raw("facebook", 200)));
  set("tiktok", () => normalizeSocial("tiktok", raw("tiktok", 200)));
  set("youtube", () => normalizeSocial("youtube", raw("youtube", 200)));
  set("website", () => normalizeWebsite(raw("website", 200)));

  await prisma.businessProfile.upsert({ where: { businessId }, create: { businessId, ...data }, update: data });
  refresh();
  if (errors.length) return fail(`Guardamos lo demás, pero hay que corregir: ${errors.join(" ")}`);
  return { ok: true, message: "Guardado." };
}

/** Cuántas fotos de la galería se ven a la vez en la página pública (1 a 8); el resto se desliza hacia el costado. */
export async function saveGallerySettings(_p: FormState, fd: FormData): Promise<FormState> {
  const g = await session();
  if (!g.s) return fail(g.error!);
  const n = Number(fd.get("galleryVisible"));
  if (!Number.isInteger(n) || n < 1 || n > 8) return fail("Elegí un número entre 1 y 8.");
  const { businessId } = g.s;
  await prisma.businessProfile.upsert({ where: { businessId }, create: { businessId, galleryVisible: n }, update: { galleryVisible: n } });
  revalidatePath("/admin/profile");
  return { ok: true, message: "Guardado." };
}

// ------------------------------------------------------------------------------------------ fotos (portada y galería)

export type PhotoResult = { ok: true } | { ok: false; error: string };
const kindSchema = z.enum(["HERO", "GALLERY"]);
const FOLDER = { HERO: "hero", GALLERY: "gallery" } as const;
const LIMIT = { HERO: MAX_HERO_PHOTOS, GALLERY: MAX_GALLERY_PHOTOS } as const;

/** Registra una foto que el navegador ya subió a /api/admin/upload. Solo se aceptan URLs propias de esta barbería y de esa carpeta. */
export async function addPhoto(kindRaw: string, url: string): Promise<PhotoResult> {
  const g = await session();
  if (!g.s) return { ok: false, error: g.error! };
  const kind = kindSchema.safeParse(kindRaw);
  if (!kind.success || typeof url !== "string") return { ok: false, error: "Petición inválida." };
  const { businessId } = g.s;
  if (!isOwnBlobUrl(url, businessId) || !new URL(url).pathname.startsWith(`/${businessId}/${FOLDER[kind.data]}/`)) return { ok: false, error: "Imagen inválida." };

  const last = await prisma.businessPhoto.findFirst({ where: { businessId, kind: kind.data }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  const count = await prisma.businessPhoto.count({ where: { businessId, kind: kind.data } });
  if (count >= LIMIT[kind.data]) {
    await deleteImage(url);
    return { ok: false, error: `Llegaste al máximo de ${LIMIT[kind.data]} fotos. Quitá alguna para agregar otra.` };
  }
  await prisma.businessPhoto.create({ data: { businessId, kind: kind.data, url, sortOrder: (last?.sortOrder ?? -1) + 1 } });
  refresh();
  return { ok: true };
}

/** Sube o baja una foto un lugar dentro de su grupo (portada o galería). */
export async function movePhoto(id: string, dir: "up" | "down"): Promise<PhotoResult> {
  const g = await session();
  if (!g.s) return { ok: false, error: g.error! };
  const { businessId } = g.s;
  const photo = await prisma.businessPhoto.findFirst({ where: { id: String(id), businessId } });
  if (!photo) return { ok: false, error: "Esa foto ya no existe." };

  const list = await prisma.businessPhoto.findMany({ where: { businessId, kind: photo.kind }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true } });
  const i = list.findIndex((x) => x.id === photo.id);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return { ok: true };
  [list[i], list[j]] = [list[j], list[i]];
  // Se reescribe el orden completo: evita que dos fotos queden con el mismo número.
  await prisma.$transaction(list.map((x, idx) => prisma.businessPhoto.update({ where: { id: x.id }, data: { sortOrder: idx } })));
  refresh();
  return { ok: true };
}

export async function removePhoto(id: string): Promise<PhotoResult> {
  const g = await session();
  if (!g.s) return { ok: false, error: g.error! };
  const { businessId } = g.s;
  const photo = await prisma.businessPhoto.findFirst({ where: { id: String(id), businessId } });
  if (!photo) return { ok: true };
  await prisma.businessPhoto.delete({ where: { id: photo.id } });
  await deleteImage(photo.url);
  refresh();
  return { ok: true };
}

// ------------------------------------------------------------------------------------------ reseñas

/** Activa o desactiva la sección de reseñas (y que los clientes puedan enviar la suya). */
export async function saveReviewSettings(_p: FormState, fd: FormData): Promise<FormState> {
  const g = await session();
  if (!g.s) return fail(g.error!);
  const { businessId } = g.s;
  const reviewsEnabled = fd.get("reviewsEnabled") === "on";
  await prisma.businessProfile.upsert({ where: { businessId }, create: { businessId, reviewsEnabled }, update: { reviewsEnabled } });
  refresh();
  return { ok: true, message: reviewsEnabled ? "Las reseñas están activadas en tu página." : "Las reseñas están desactivadas." };
}

/** Reseña cargada por el administrador (queda aprobada). */
export async function createReview(_p: FormState, fd: FormData): Promise<FormState> {
  const g = await session();
  if (!g.s) return fail(g.error!);
  const parsed = reviewSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail(firstError(parsed.error));
  await prisma.review.create({ data: { ...parsed.data, businessId: g.s.businessId, status: "APPROVED", source: "ADMIN" } });
  refresh();
  return { ok: true, message: "Reseña agregada." };
}

const idSchema = z.string().min(1).max(40);

export async function setReviewStatus(fd: FormData) {
  const { businessId } = await requireWritable();
  const id = idSchema.parse(fd.get("id"));
  const status = z.enum(["APPROVED", "HIDDEN"]).parse(fd.get("status"));
  await prisma.review.updateMany({ where: { id, businessId }, data: { status } });
  refresh();
}

export async function deleteReview(fd: FormData) {
  const { businessId } = await requireWritable();
  const id = idSchema.parse(fd.get("id"));
  await prisma.review.deleteMany({ where: { id, businessId } });
  refresh();
}
