"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Modal } from "./Modal";

const OUT_SIZE = 512; // px del lado de la foto final (se muestra siempre en círculo)
const PREVIEW_SIZE = 96;

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo leer la imagen"));
    img.src = src;
  });
}

function draw(img: HTMLImageElement, area: Area, canvas: HTMLCanvasElement, side: number) {
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Tu navegador no soporta el recorte");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, side, side);
}

/**
 * Recorte circular de la foto de perfil. Devuelve un File cuadrado ya recortado y comprimido (WebP):
 * el servidor solo recibe esa versión, nunca la original.
 */
export function PhotoCropper({ src, onCancel, onDone }: { src: string; onCancel: () => void; onDone: (file: File) => void }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const preview = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let alive = true;
    loadImage(src)
      .then((i) => alive && setImg(i))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [src]);

  const onComplete = useCallback((_: Area, pixels: Area) => setArea(pixels), []);

  // Vista previa en tiempo real del resultado
  useEffect(() => {
    if (img && area && preview.current) draw(img, area, preview.current, PREVIEW_SIZE * 2);
  }, [img, area]);

  async function confirm() {
    if (!img || !area) return;
    setBusy(true);
    setError(null);
    try {
      const canvas = document.createElement("canvas");
      draw(img, area, canvas, Math.min(OUT_SIZE, Math.round(area.width))); // nunca se agranda
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", 0.85));
      if (!blob) throw new Error("No se pudo procesar la imagen");
      const ext = blob.type === "image/webp" ? "webp" : blob.type === "image/jpeg" ? "jpg" : "png";
      onDone(new File([blob], `foto.${ext}`, { type: blob.type }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al recortar");
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onCancel} title="Ajustá la foto" locked={busy}>
      <p className="text-sm text-neutral-500">Arrastrá la imagen para encuadrar y usá el zoom. Se mostrará siempre en círculo.</p>

      <div className="relative h-72 w-full overflow-hidden rounded-xl bg-neutral-900">
        {img && (
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            minZoom={1}
            maxZoom={4}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onComplete}
          />
        )}
        {!img && !error && <div className="flex h-full items-center justify-center text-sm text-neutral-300">Cargando…</div>}
      </div>

      <div className="flex items-center gap-4">
        <label className="flex flex-1 items-center gap-2 text-sm text-neutral-600">
          <span aria-hidden>🔍</span>
          <input
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label="Zoom"
            className="w-full"
          />
        </label>
        <div className="flex flex-col items-center gap-1">
          <canvas
            ref={preview}
            style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}
            className="rounded-full border border-neutral-200 bg-neutral-100"
          />
          <span className="text-xs text-neutral-400">Vista previa</span>
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
        <button type="button" className="btn" onClick={confirm} disabled={busy || !img || !area}>
          {busy ? "Procesando…" : "Usar esta foto"}
        </button>
      </div>
    </Modal>
  );
}
