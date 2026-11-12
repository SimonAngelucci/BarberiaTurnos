"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { addPhoto, addVideo, discardUploads, movePhoto, removePhoto, setPhotoVisible } from "@/app/admin/profile/actions";
import { IMAGE_TYPES, MAX_SOURCE, inspectVideo, shrink, uploadFile } from "@/lib/client-image";
import { MAX_GALLERY_VIDEOS, VIDEO_MAX_MS, VIDEO_MAX_MB, videoProblem } from "@/lib/media";

type Item = { id: string; url: string; mediaType: "IMAGE" | "VIDEO"; posterUrl: string | null; visible: boolean };

/** Archivo elegido, ya revisado y con vista previa, esperando que el administrador toque «Publicar». */
type Staged = {
  key: string;
  name: string;
  type: "IMAGE" | "VIDEO";
  file: File; // lo que se sube (la foto ya achicada o el MP4 original)
  previewUrl: string;
  poster?: File;
  posterPreview?: string;
  meta?: { durationMs: number; width: number; height: number };
};

const MAX_VIDEO_SOURCE = VIDEO_MAX_MB * 1024 * 1024;
const revoke = (s: Staged) => {
  URL.revokeObjectURL(s.previewUrl);
  if (s.posterPreview) URL.revokeObjectURL(s.posterPreview);
};
const isMp4 =(f: File) => f.type === "video/mp4" || (f.type === "" && /\.mp4$/i.test(f.name));

/**
 * Galería del panel: fotos y videos cortos. Detecta el tipo de cada archivo, muestra una vista previa antes de publicar,
 * y permite ordenar, mostrar/ocultar y eliminar. Las reglas de los videos se avisan acá y se vuelven a validar en el servidor.
 */
export function MediaManager({ items, max, enabled }: { items: Item[]; max: number; enabled: boolean }) {
  const picker = useRef<HTMLInputElement>(null);
  const [staged, setStaged] = useState<Staged[]>([]);
  const stagedRef = useRef<Staged[]>([]);
  stagedRef.current = staged;
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, start] = useTransition();

  const videosNow = items.filter((i) => i.mediaType === "VIDEO").length;
  const room = max - items.length - staged.length;
  const locked = pending || !!busy || reading;

  // Libera las vistas previas locales al salir de la pantalla.
  useEffect(
    () => () => {
      stagedRef.current.forEach(revoke);
    },
    [],
  );

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (picker.current) picker.current.value = "";
    if (!files.length) return;
    setReading(true);
    const errs: string[] = [];
    const add: Staged[] = [];
    let videosPlanned = videosNow + staged.filter((s) => s.type === "VIDEO").length;
    const accepted = files.slice(0, Math.max(0, room));
    if (files.length > accepted.length) errs.push(`Solo entran ${max} elementos: se ignoraron ${files.length - accepted.length}.`);

    for (const f of accepted) {
      try {
        if (IMAGE_TYPES.includes(f.type)) {
          if (f.size > MAX_SOURCE) throw new Error("La imagen supera los 15 MB.");
          const small = await shrink(f);
          add.push({ key: crypto.randomUUID(), name: f.name, type: "IMAGE", file: small, previewUrl: URL.createObjectURL(small) });
        } else if (isMp4(f) || f.type.startsWith("video/")) {
          if (!isMp4(f)) throw new Error("El video tiene que ser MP4 (H.264).");
          if (f.size > MAX_VIDEO_SOURCE) throw new Error(`El video pesa ${(f.size / 1048576).toFixed(1)} MB y el máximo es ${VIDEO_MAX_MB} MB. Exportalo en 720p y de 3 a 5 segundos.`);
          if (videosPlanned >= MAX_GALLERY_VIDEOS) throw new Error(`Llegaste al máximo de ${MAX_GALLERY_VIDEOS} videos.`);
          const previewUrl = URL.createObjectURL(f);
          try {
            const info = await inspectVideo(f, previewUrl);
            const problem = videoProblem(info);
            if (problem) throw new Error(problem);
            add.push({ key: crypto.randomUUID(), name: f.name, type: "VIDEO", file: f, previewUrl, poster: info.poster, posterPreview: URL.createObjectURL(info.poster), meta: { durationMs: info.durationMs, width: info.width, height: info.height } });
            videosPlanned++;
          } catch (err) {
            URL.revokeObjectURL(previewUrl);
            throw err;
          }
        } else {
          throw new Error("Formato no permitido: usá fotos (PNG, JPG, WebP) o videos MP4.");
        }
      } catch (err) {
        errs.push(`${f.name}: ${err instanceof Error ? err.message : "no se pudo leer el archivo"}`);
      }
    }
    setStaged((cur) => [...cur, ...add]);
    setErrors(errs);
    setReading(false);
  }

  const drop = (key: string) =>
    setStaged((cur) => {
      cur.filter((s) => s.key === key).forEach(revoke);
      return cur.filter((s) => s.key !== key);
    });

  async function publish() {
    const queue = [...staged];
    const errs: string[] = [];
    for (let i = 0; i < queue.length; i++) {
      const s = queue[i];
      setBusy(`Publicando ${i + 1} de ${queue.length}…`);
      const uploaded: string[] = [];
      try {
        if (s.type === "IMAGE") {
          const url = await uploadFile(s.file, "gallery");
          const r = await addPhoto("GALLERY", url);
          if (!r.ok) throw new Error(r.error);
        } else {
          const url = await uploadFile(s.file, "video");
          uploaded.push(url);
          const posterUrl = await uploadFile(s.poster!, "gallery");
          uploaded.push(posterUrl);
          const r = await addVideo({ url, posterUrl, ...s.meta, sizeBytes: s.file.size });
          uploaded.length = 0; // el servidor ya se hizo cargo de los archivos (los guardó o los borró)
          if (!r.ok) throw new Error(r.error);
        }
        drop(s.key);
      } catch (err) {
        if (uploaded.length) await discardUploads(uploaded).catch(() => {});
        errs.push(`${s.name}: ${err instanceof Error ? err.message : "error al publicar"}`);
      }
    }
    setBusy(null);
    setErrors(errs);
  }

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      setErrors(r.ok ? [] : [r.error ?? "No se pudo completar la acción."]);
    });

  return (
    <div className="space-y-4">
      {/* Elementos publicados */}
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 p-4 text-center text-sm text-neutral-500">Todavía no hay fotos ni videos.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {items.map((p, i) => (
            <li key={p.id} className={`overflow-hidden rounded-xl border bg-neutral-50 ${p.visible ? "border-neutral-200" : "border-dashed border-neutral-300"}`}>
              <div className="relative aspect-square w-full bg-neutral-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.mediaType === "VIDEO" ? (p.posterUrl ?? "") : p.url} alt={`Elemento ${i + 1}`} loading="lazy" className={`h-full w-full object-cover ${p.visible ? "" : "opacity-40 grayscale"}`} />
                {p.mediaType === "VIDEO" && <span className="absolute left-1.5 top-1.5 rounded-full bg-black/65 px-2 py-0.5 text-[11px] font-medium text-white">▶ Video</span>}
                {!p.visible && <span className="absolute right-1.5 top-1.5 rounded-full bg-neutral-800/80 px-2 py-0.5 text-[11px] font-medium text-white">Oculto</span>}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-1 p-1.5">
                <span className="pl-1 text-xs text-neutral-500">{i + 1}</span>
                <div className="flex gap-1">
                  <button type="button" aria-label="Mover antes" disabled={locked || i === 0} onClick={() => run(() => movePhoto(p.id, "up"))} className="btn-ghost !px-2 !py-1 disabled:opacity-40">
                    ←
                  </button>
                  <button type="button" aria-label="Mover después" disabled={locked || i === items.length - 1} onClick={() => run(() => movePhoto(p.id, "down"))} className="btn-ghost !px-2 !py-1 disabled:opacity-40">
                    →
                  </button>
                  <button
                    type="button"
                    aria-label={p.visible ? "Ocultar de la página" : "Mostrar en la página"}
                    title={p.visible ? "Ocultar de la página" : "Mostrar en la página"}
                    disabled={locked}
                    onClick={() => run(() => setPhotoVisible(p.id, !p.visible))}
                    className="btn-ghost !px-2 !py-1 disabled:opacity-40"
                  >
                    {p.visible ? "👁" : "🚫"}
                  </button>
                  <button
                    type="button"
                    aria-label="Quitar"
                    disabled={locked}
                    onClick={() => confirm(p.mediaType === "VIDEO" ? "¿Eliminar este video?" : "¿Eliminar esta foto?") && run(() => removePhoto(p.id))}
                    className="btn-ghost !border-red-300 !px-2 !py-1 !text-red-600 disabled:opacity-40"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Vista previa antes de publicar */}
      {staged.length > 0 && (
        <div className="space-y-3 rounded-xl border border-brand/30 bg-neutral-50 p-3">
          <div>
            <h3 className="text-sm font-semibold">Vista previa — todavía no está publicado</h3>
            <p className="text-xs text-neutral-500">Así se van a ver. Tocá «Publicar» para subirlos a tu página.</p>
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {staged.map((s) => (
              <li key={s.key} className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
                <div className="relative aspect-square w-full bg-neutral-900">
                  {s.type === "VIDEO" ? (
                    <video src={s.previewUrl} poster={s.posterPreview} muted loop autoPlay playsInline className="h-full w-full object-cover" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.previewUrl} alt="" className="h-full w-full object-cover" />
                  )}
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-black/65 px-2 py-0.5 text-[11px] font-medium text-white">{s.type === "VIDEO" ? "▶ Video" : "Foto"}</span>
                </div>
                <div className="flex items-center justify-between gap-2 p-2">
                  <span className="min-w-0 truncate text-xs text-neutral-500" title={s.name}>
                    {s.type === "VIDEO" && s.meta ? `${(s.meta.durationMs / 1000).toFixed(1)} s · ${(s.file.size / 1048576).toFixed(1)} MB` : `${(s.file.size / 1024).toFixed(0)} KB`}
                  </span>
                  <button type="button" disabled={locked} onClick={() => drop(s.key)} className="btn-ghost !px-2 !py-1 !text-xs disabled:opacity-40">
                    Quitar
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn" disabled={locked} onClick={publish}>
              {busy ?? `Publicar ${staged.length} ${staged.length === 1 ? "elemento" : "elementos"}`}
            </button>
            <button type="button" className="btn-ghost" disabled={locked} onClick={() => staged.forEach((s) => drop(s.key))}>
              Descartar todo
            </button>
          </div>
        </div>
      )}

      {/* Selector */}
      <div className="space-y-1.5">
        <input
          ref={picker}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp,video/mp4"
          disabled={!enabled || locked || room <= 0}
          onChange={onPick}
          aria-label="Agregar fotos o videos"
          className="block w-full text-sm text-neutral-600 file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-neutral-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium disabled:opacity-50"
        />
        <p className="text-xs text-neutral-400">
          {items.length} de {max} elementos · el orden de arriba es el de la página · 👁 muestra u oculta cada uno
        </p>
        <p className="text-xs text-neutral-400">
          <strong>Fotos:</strong> PNG, JPG o WebP (se achican solas). <strong>Videos:</strong> MP4 (H.264), de 3 a 5 segundos (máx. {VIDEO_MAX_MS / 1000} s), vertical 9:16 o cuadrado 1:1, hasta 720p y {VIDEO_MAX_MB} MB, hasta {MAX_GALLERY_VIDEOS}.
          Se reproducen solos, en bucle y sin sonido.
        </p>
        {reading && <p className="text-sm font-medium text-neutral-700">Revisando archivos…</p>}
        {!enabled && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">La subida de archivos no está activada (falta conectar Vercel Blob). Mirá el paso a paso en Profesionales o Personalización.</p>}
        {errors.map((m, i) => (
          <p key={i} role="alert" className="rounded-lg bg-red-50 p-2 text-xs text-red-700">
            {m}
          </p>
        ))}
      </div>
    </div>
  );
}
