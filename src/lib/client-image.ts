// Utilidades del navegador para preparar imágenes antes de subirlas (las usan PhotoManager y MediaManager).

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const MAX_SOURCE = 15 * 1024 * 1024; // foto original del celular; se achica antes de subir
export const MAX_UPLOAD = 2 * 1024 * 1024; // lo que acepta el servidor
const MAX_SIDE = 1920;

/** Achica y recomprime la foto (máx. 1920 px de lado, JPEG): las fotos de celular pesan varios MB y el servidor acepta hasta 2 MB. */
export async function shrink(file: File): Promise<File> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); // respeta la orientación de la cámara
  } catch {
    throw new Error("No se pudo leer la imagen. Probá con otra.");
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Tu navegador no pudo procesar la imagen.");
  ctx.fillStyle = "#fff"; // los PNG con transparencia quedan sobre blanco
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  for (const q of [0.85, 0.7, 0.55]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", q));
    if (blob && blob.size <= MAX_UPLOAD) return new File([blob], "foto.jpg", { type: "image/jpeg" });
  }
  throw new Error("La foto sigue siendo muy pesada. Probá con otra.");
}

/** Sube un archivo a /api/admin/upload y devuelve la URL (o lanza con un mensaje claro). */
export async function uploadFile(file: File, kind: "hero" | "gallery" | "video"): Promise<string> {
  const fd = new FormData();
  fd.set("file", file);
  fd.set("kind", kind);
  const res = await fetch("/api/admin/upload", { method: "POST", body: fd }).catch(() => null);
  if (!res) throw new Error("No hay conexión. Revisá tu internet e intentá de nuevo.");
  const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !j.url) throw new Error(j.error ?? (res.status === 413 ? "El archivo es demasiado pesado." : "No se pudo subir el archivo."));
  return j.url;
}

export type VideoInfo = { durationMs: number; width: number; height: number; poster: File };

/**
 * Lee un video en el navegador: duración, medidas y una imagen de portada (un fotograma, en JPEG liviano).
 * Usa la URL local del archivo; no sube nada.
 */
export async function inspectVideo(file: File, objectUrl: string): Promise<VideoInfo> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = objectUrl;

  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("No pudimos leer el video. Probá con otro MP4.")), 15000);
    video.onloadeddata = () => {
      clearTimeout(t);
      resolve();
    };
    video.onerror = () => {
      clearTimeout(t);
      reject(new Error("Tu navegador no pudo abrir este video. Usá un MP4 con H.264."));
    };
  });

  const durationMs = Math.round(video.duration * 1000);
  const width = video.videoWidth;
  const height = video.videoHeight;

  // Fotograma de portada: cerca de la mitad, para no usar un cuadro negro del inicio.
  await new Promise<void>((resolve) => {
    const t = setTimeout(resolve, 4000);
    video.onseeked = () => {
      clearTimeout(t);
      resolve();
    };
    video.currentTime = Math.min(Math.max(video.duration / 2, 0.1), Math.max(video.duration - 0.1, 0));
  });
  const scale = Math.min(1, 720 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Tu navegador no pudo procesar el video.");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  let poster: File | null = null;
  for (const q of [0.78, 0.6, 0.45]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", q));
    if (blob && blob.size <= MAX_UPLOAD) {
      poster = new File([blob], "portada.jpg", { type: "image/jpeg" });
      break;
    }
  }
  video.removeAttribute("src");
  video.load();
  if (!poster) throw new Error("No pudimos generar la portada del video.");
  return { durationMs, width, height, poster };
}
