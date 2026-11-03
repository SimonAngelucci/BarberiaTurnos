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
  return new UploadError(`No se pudo subir la imagen (${msg.slice(0, 140)}). Intentá de nuevo.`, 502);
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
