"use client";

import { useEffect, useRef, useState } from "react";
import { PhotoCropper } from "./PhotoCropper";

const TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_UPLOAD = 2 * 1024 * 1024; // lo que acepta el servidor
const MAX_SOURCE = 12 * 1024 * 1024; // foto original (se recorta y comprime antes de subir)

type Status = "idle" | "uploading" | "done" | "error";

/**
 * Selector de imagen con vista previa inmediata y subida al elegirla.
 *
 * 1. Al elegir un archivo se valida y se muestra la vista previa al instante.
 * 2. Se sube a /api/admin/upload (que responde con errores claros) y la URL resultante queda en un
 *    campo oculto `name`; el formulario solo guarda esa URL cuando se toca «Guardar».
 * 3. Con `crop` (foto de perfil) se abre antes el recortador circular y se sube SOLO la versión recortada.
 * Si hay imagen actual, un checkbox `removeName` permite quitarla.
 */
export function ImageField({
  name,
  removeName,
  label,
  kind,
  currentUrl,
  enabled,
  round = true,
  size = 72,
  crop = false,
}: {
  name: string;
  removeName: string;
  label: string;
  kind: "logo" | "barber" | "service";
  currentUrl: string | null;
  enabled: boolean;
  round?: boolean;
  size?: number;
  crop?: boolean;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [remove, setRemove] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  // Tras guardar, la imagen real (currentUrl) reemplaza a la vista previa local.
  useEffect(() => {
    setPreview(null);
    setUrl(null);
    setStatus("idle");
  }, [currentUrl]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  useEffect(() => () => void (cropSrc && URL.revokeObjectURL(cropSrc)), [cropSrc]);

  const resetPicker = () => {
    if (picker.current) picker.current.value = ""; // permite volver a elegir el mismo archivo
  };

  async function upload(file: File) {
    setError(null);
    setRemove(false);
    setUrl(null);
    setPreview(URL.createObjectURL(file)); // vista previa inmediata, antes de que termine la subida
    setStatus("uploading");
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("kind", kind);
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !j.url) throw new Error(j.error ?? "No se pudo subir la imagen. Intentá de nuevo.");
      setUrl(j.url);
      setStatus("done");
    } catch (e) {
      setPreview(null); // vuelve a mostrar la imagen que había
      setStatus("error");
      setError(e instanceof Error ? e.message : "No se pudo subir la imagen.");
      resetPicker();
    }
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setError(null);
    if (!f) return;
    const fail = (msg: string) => {
      setStatus("error");
      setError(msg);
      resetPicker();
    };
    if (!TYPES.includes(f.type)) return fail("Usá una imagen PNG, JPG o WebP.");
    if (f.size > (crop ? MAX_SOURCE : MAX_UPLOAD)) return fail(`La imagen supera los ${crop ? 12 : 2} MB.`);
    if (crop) return setCropSrc(URL.createObjectURL(f)); // se sube al confirmar el recorte
    void upload(f);
  }

  function onCropDone(file: File) {
    setCropSrc(null);
    resetPicker();
    if (file.size > MAX_UPLOAD) {
      setStatus("error");
      return setError("La foto recortada sigue siendo muy pesada. Probá con otra imagen.");
    }
    void upload(file);
  }

  const shown = remove ? null : (preview ?? currentUrl);
  const radius = round ? "rounded-full" : "rounded-xl";

  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex items-center gap-3">
        <div
          style={{ width: size, height: size }}
          className={`relative flex shrink-0 items-center justify-center overflow-hidden border border-neutral-200 bg-neutral-100 text-xs text-neutral-400 ${radius}`}
        >
          {shown ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={shown} alt="" className="h-full w-full object-cover" />
          ) : (
            "Sin imagen"
          )}
          {status === "uploading" && <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-xs font-medium text-neutral-700">Subiendo…</div>}
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          <input
            ref={picker}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={!enabled || status === "uploading"}
            onChange={onChange}
            aria-label={label}
            className="block w-full text-sm text-neutral-600 file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-neutral-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium disabled:opacity-50"
          />
          {/* La URL ya subida es lo único que viaja al guardar el formulario. */}
          <input type="hidden" name={name} value={url ?? ""} />

          {currentUrl && (
            <label className="flex items-center gap-2 text-xs text-neutral-500">
              <input type="checkbox" name={removeName} checked={remove} onChange={(e) => setRemove(e.target.checked)} /> Quitar imagen actual
            </label>
          )}

          {status === "done" && <p className="text-xs text-green-700">✓ Imagen lista. Tocá «Guardar» para publicarla.</p>}
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 p-2 text-xs text-red-700">
              {error}
            </p>
          )}
          <p className="text-xs text-neutral-400">{crop ? "PNG, JPG o WebP · después podés recortarla en círculo" : "PNG, JPG o WebP · máx. 2 MB"}</p>
        </div>
      </div>

      {!enabled && (
        <div role="alert" className="mt-2 space-y-1 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <strong>La subida de imágenes todavía no está activada.</strong>
          <ol className="list-decimal space-y-0.5 pl-4">
            <li>En Vercel: Storage → Create → Blob (acceso público).</li>
            <li>Conectalo a este proyecto (agrega solo BLOB_READ_WRITE_TOKEN).</li>
            <li>Hacé un Redeploy sin caché.</li>
          </ol>
          <span>En tu PC también hace falta esa variable en el archivo .env.</span>
        </div>
      )}

      {cropSrc && <PhotoCropper src={cropSrc} onCancel={() => { setCropSrc(null); resetPicker(); }} onDone={onCropDone} />}
    </div>
  );
}
