// Límites de los videos cortos de la galería. Los comparten el panel (que avisa antes de subir) y el servidor (que vuelve a validar).

export const MAX_GALLERY_VIDEOS = 8;
export const VIDEO_MIN_MS = 1000;
export const VIDEO_MAX_MS = 6000;
/** 720p: el lado corto hasta 720 px y el largo hasta 1280 px. */
export const VIDEO_MAX_SHORT = 720;
export const VIDEO_MAX_LONG = 1280;
export const VIDEO_MAX_MB = 4;

/** Mensaje de error si las medidas no cumplen; null si están bien. Vertical (9:16) o cuadrado (1:1). */
export function videoProblem(m: { durationMs: number; width: number; height: number }): string | null {
  const { durationMs, width, height } = m;
  if (![durationMs, width, height].every((n) => Number.isFinite(n) && n > 0)) return "No pudimos leer el video. Probá con otro MP4.";
  if (durationMs < VIDEO_MIN_MS) return "El video es demasiado corto (mínimo 1 segundo).";
  if (durationMs > VIDEO_MAX_MS) return `El video dura ${(durationMs / 1000).toFixed(1)} s. Tiene que durar entre 3 y 5 segundos (máximo ${VIDEO_MAX_MS / 1000} s).`;
  if (width > height) return "El video tiene que ser vertical (9:16) o cuadrado (1:1), no horizontal.";
  if (width > VIDEO_MAX_SHORT || height > VIDEO_MAX_LONG) return `La resolución máxima es 720p (${VIDEO_MAX_SHORT}×${VIDEO_MAX_LONG}). Este video es de ${width}×${height}.`;
  return null;
}
