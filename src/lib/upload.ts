import { put, del } from "@vercel/blob";

export const uploadsEnabled = () => !!process.env.BLOB_READ_WRITE_TOKEN;

const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const BLOB_HOST = ".public.blob.vercel-storage.com";

/** Error con un mensaje apto para mostrarle al usuario tal cual. */
export class UploadError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/** Traduce los errores técnicos del SDK de Vercel Blob a algo que el dueño pueda resolver. */
function explain(e: unknown): UploadError {
  const msg = String((e as Error)?.message ?? e);
  if (/private/i.test(msg)) {
    return new UploadError("Tu Blob de Vercel es privado. Creá uno público (Storage → Create → Blob → Public), conectalo al proyecto y hacé Redeploy.", 500);
  }
  if (/token|unauthor|forbidden|403|401|store.*(not|doesn)/i.test(msg)) {
    return new UploadError("El token de Vercel Blob no es válido para este proyecto. Reconectá el Blob en Vercel (Storage → tu Blob → Connect Project) y hacé Redeploy.", 500);
  }
  return new UploadError(`No se pudo subir el archivo (${msg.slice(0, 140)}). Intentá de nuevo.`, 502);
}

/**
 * Sube una imagen a Vercel Blob validando tipo y tamaño en el servidor.
 * SVG no se acepta a propósito. Lanza UploadError con un mensaje claro.
 */
export async function uploadImage(file: FormDataEntryValue | null, folder: string): Promise<string> {
  if (!(file instanceof File) || file.size === 0) throw new UploadError("Elegí una imagen.");
  if (!uploadsEnabled()) {
    throw new UploadError("Falta conectar Vercel Blob a este proyecto (variable BLOB_READ_WRITE_TOKEN). Mirá los pasos debajo del botón.", 503);
  }
  const ext = TYPES[file.type];
  if (!ext) throw new UploadError("Formato no permitido: usá PNG, JPG o WebP.");
  if (file.size > MAX_IMAGE_BYTES) throw new UploadError("La imagen supera los 2 MB.");
  try {
    const blob = await put(`${folder}/${Date.now()}.${ext}`, file, { access: "public", addRandomSuffix: true });
    return blob.url;
  } catch (e) {
    console.error("blob put", e);
    throw explain(e);
  }
}

/** Los videos cortos pesan poco; el tope deja margen bajo el límite de 4,5 MB por pedido de Vercel. */
export const MAX_VIDEO_BYTES = 4 * 1024 * 1024;

/**
 * Sube un video corto (MP4 con H.264) a Vercel Blob. En el servidor se comprueba el tipo, el peso y que el contenido sea
 * de verdad un MP4 con H.264 (no alcanza con confiar en la extensión ni en el tipo que declara el navegador).
 */
export async function uploadVideo(file: FormDataEntryValue | null, folder: string): Promise<string> {
  if (!(file instanceof File) || file.size === 0) throw new UploadError("Elegí un video.");
  if (!uploadsEnabled()) throw new UploadError("Falta conectar Vercel Blob a este proyecto (variable BLOB_READ_WRITE_TOKEN).", 503);
  if (file.type !== "video/mp4") throw new UploadError("Formato no permitido: el video tiene que ser MP4.");
  if (file.size > MAX_VIDEO_BYTES) throw new UploadError("El video supera los 4 MB. Exportalo en 720p y de 3 a 5 segundos.");
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length < 12 || buf.toString("latin1", 4, 8) !== "ftyp") throw new UploadError("El archivo no es un MP4 válido.");
  if (!buf.includes("avc1")) throw new UploadError("El video tiene que estar codificado en H.264 (formato MP4 estándar).");
  try {
    const blob = await put(`${folder}/${Date.now()}.mp4`, buf, { access: "public", addRandomSuffix: true, contentType: "video/mp4" });
    return blob.url;
  } catch (e) {
    console.error("blob put video", e);
    throw explain(e);
  }
}

/**
 * ¿Esta URL es una imagen subida por NUESTRA subida, dentro de la carpeta de ESTA barbería?
 * Evita que alguien guarde como logo una URL arbitraria o la imagen de otra barbería.
 */
export function isOwnBlobUrl(url: string, businessId: string) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname.endsWith(BLOB_HOST) && u.pathname.startsWith(`/${businessId}/`);
  } catch {
    return false;
  }
}

/** Borra una imagen anterior; ignora URLs que no sean de nuestro Blob. */
export async function deleteImage(url: string | null | undefined) {
  if (!url || !url.includes(BLOB_HOST) || !uploadsEnabled()) return;
  try {
    await del(url);
  } catch (e) {
    console.error("blob delete", e);
  }
}
