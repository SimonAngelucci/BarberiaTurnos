"use client";

import { useRef, useState, useTransition } from "react";
import { addPhoto, movePhoto, removePhoto } from "@/app/admin/profile/actions";
import { IMAGE_TYPES as TYPES, MAX_SOURCE, shrink } from "@/lib/client-image";

type Photo = { id: string; url: string };

export function PhotoManager({ kind, photos, max, enabled }: { kind: "HERO" | "GALLERY"; photos: Photo[]; max: number; enabled: boolean }) {
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null); // texto de progreso mientras se sube
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const room = max - photos.length;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (picker.current) picker.current.value = "";
    if (!files.length) return;
    const errs: string[] = [];
    const batch = files.slice(0, Math.max(0, room));
    if (files.length > batch.length) errs.push(`Solo entran ${max} fotos: se ignoraron ${files.length - batch.length}.`);

    for (let i = 0; i < batch.length; i++) {
      const f = batch[i];
      setBusy(`Subiendo ${i + 1} de ${batch.length}…`);
      try {
        if (!TYPES.includes(f.type)) throw new Error("Usá imágenes PNG, JPG o WebP.");
        if (f.size > MAX_SOURCE) throw new Error("La imagen supera los 15 MB.");
        const small = await shrink(f);
        const fd = new FormData();
        fd.set("file", small);
        fd.set("kind", kind === "HERO" ? "hero" : "gallery");
        const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
        const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
        if (!res.ok || !j.url) throw new Error(j.error ?? "No se pudo subir la imagen.");
        const r = await addPhoto(kind, j.url);
        if (!r.ok) throw new Error(r.error);
      } catch (err) {
        errs.push(`${f.name}: ${err instanceof Error ? err.message : "error al subir"}`);
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
    <div className="space-y-3">
      {photos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 p-4 text-center text-sm text-neutral-500">Todavía no hay fotos.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {photos.map((p, i) => (
            <li key={p.id} className="overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={`Foto ${i + 1}`} className="aspect-[4/3] w-full object-cover" loading="lazy" />
              <div className="flex items-center justify-between gap-1 p-1.5">
                <span className="pl-1 text-xs text-neutral-500">{i + 1}</span>
                <div className="flex gap-1">
                  <button type="button" aria-label="Mover antes" disabled={pending || !!busy || i === 0} onClick={() => run(() => movePhoto(p.id, "up"))} className="btn-ghost !px-2 !py-1 disabled:opacity-40">
                    ←
                  </button>
                  <button type="button" aria-label="Mover después" disabled={pending || !!busy || i === photos.length - 1} onClick={() => run(() => movePhoto(p.id, "down"))} className="btn-ghost !px-2 !py-1 disabled:opacity-40">
                    →
                  </button>
                  <button
                    type="button"
                    aria-label="Quitar foto"
                    disabled={pending || !!busy}
                    onClick={() => confirm("¿Quitar esta foto?") && run(() => removePhoto(p.id))}
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

      <div className="space-y-1.5">
        <input
          ref={picker}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp"
          disabled={!enabled || !!busy || room <= 0}
          onChange={onPick}
          aria-label="Agregar fotos"
          className="block w-full text-sm text-neutral-600 file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-neutral-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium disabled:opacity-50"
        />
        <p className="text-xs text-neutral-400">
          {photos.length} de {max} fotos · podés elegir varias a la vez · PNG, JPG o WebP (se achican solas) · el orden de arriba es el de la página
        </p>
        {busy && <p className="text-sm font-medium text-neutral-700">{busy}</p>}
        {!enabled && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">La subida de imágenes no está activada (falta conectar Vercel Blob). Mirá el paso a paso en Barberos o Negocio.</p>}
        {errors.map((m, i) => (
          <p key={i} role="alert" className="rounded-lg bg-red-50 p-2 text-xs text-red-700">
            {m}
          </p>
        ))}
      </div>
    </div>
  );
}
