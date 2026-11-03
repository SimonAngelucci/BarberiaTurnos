import { put, del } from "@vercel/blob";

export const uploadsEnabled = () => !!process.env.BLOB_READ_WRITE_TOKEN;

const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/**
 * Sube una imagen a Vercel Blob validando tipo y tamaño en el servidor.
 * Devuelve null si no se eligió archivo. SVG no se acepta a propósito.
 */
export async function uploadImage(file: FormDataEntryValue | null, folder: string): Promise<string | null> {
  if (!(file instanceof File) || file.size === 0) return null;
  if (!uploadsEnabled()) throw new Error("Falta configurar Vercel Blob (BLOB_READ_WRITE_TOKEN)");
  const ext = TYPES[file.type];
  if (!ext) throw new Error("Formato no permitido (usá PNG, JPG o WebP)");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("La imagen supera los 2 MB");
  const blob = await put(`${folder}/${Date.now()}.${ext}`, file, { access: "public", addRandomSuffix: true });
  return blob.url;
}

/** Borra una imagen anterior; ignora URLs que no sean de nuestro Blob. */
export async function deleteImage(url: string | null | undefined) {
  if (!url || !url.includes(".public.blob.vercel-storage.com") || !uploadsEnabled()) return;
  try {
    await del(url);
  } catch (e) {
    console.error("blob delete", e);
  }
}
