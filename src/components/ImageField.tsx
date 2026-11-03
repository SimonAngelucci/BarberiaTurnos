"use client";

import { useEffect, useRef, useState } from "react";
import { PhotoCropper } from "./PhotoCropper";

const TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_UPLOAD = 2 * 1024 * 1024; // lo que acepta el servidor
const MAX_SOURCE = 12 * 1024 * 1024; // foto original (se recorta y comprime antes de enviar)

/**
 * Selector de imagen con vista previa. Valida tipo/tamaño en el cliente (el servidor vuelve a validar).
 *
 * - Sin `crop` (logo): el archivo elegido se envía tal cual en `name`.
 * - Con `crop` (foto de perfil): se abre el recortador circular y se envía SOLO la versión recortada
 *   y comprimida, a través de un input oculto `name`; la foto original nunca sale del navegador.
 * Si hay imagen actual, un checkbox `removeName` permite quitarla.
 */
export function ImageField({
  name,
  removeName,
  label,
  currentUrl,
  enabled,
  round = true,
  size = 72,
  crop = false,
}: {
  name: string;
  removeName: string;
  label: string;
  currentUrl: string | null;
  enabled: boolean;
  round?: boolean;
  size?: number;
  crop?: boolean;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [remove, setRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const hidden = useRef<HTMLInputElement>(null);

  // Tras guardar, la URL real reemplaza a la vista previa local.
  useEffect(() => setPreview(null), [currentUrl]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  useEffect(() => () => void (cropSrc && URL.revokeObjectURL(cropSrc)), [cropSrc]);

  function reject(input: HTMLInputElement, msg: string) {
    input.value = "";
    setPreview(null);
    setError(msg);
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setError(null);
    if (!f) return setPreview(null);
    if (!TYPES.includes(f.type)) return reject(e.target, "Usá una imagen PNG, JPG o WebP");
    if (f.size > (crop ? MAX_SOURCE : MAX_UPLOAD)) return reject(e.target, `La imagen supera los ${crop ? 12 : 2} MB`);
    if (crop) return setCropSrc(URL.createObjectURL(f)); // la vista previa llega al confirmar el recorte
    setRemove(false);
    setPreview(URL.createObjectURL(f));
  }

  function onCropDone(file: File) {
    if (file.size > MAX_UPLOAD) {
      setCropSrc(null);
      if (picker.current) picker.current.value = "";
      return setError("La foto recortada sigue siendo muy pesada. Probá con otra imagen.");
    }
    const dt = new DataTransfer();
    dt.items.add(file);
    if (hidden.current) hidden.current.files = dt.files;
    setRemove(false);
    setPreview(URL.createObjectURL(file));
    setCropSrc(null);
    if (picker.current) picker.current.value = ""; // permite volver a elegir el mismo archivo
  }

  function onCropCancel() {
    setCropSrc(null);
    if (picker.current) picker.current.value = "";
  }

  const shown = remove ? null : (preview ?? currentUrl);
  const radius = round ? "rounded-full" : "rounded-xl";

  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex items-center gap-3">
        <div
          style={{ width: size, height: size }}
          className={`flex shrink-0 items-center justify-center overflow-hidden border border-neutral-200 bg-neutral-100 text-xs text-neutral-400 ${radius}`}
        >
          {shown ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={shown} alt="" className="h-full w-full object-cover" />
          ) : (
            "Sin foto"
          )}
        </div>
        <div className="min-w-0 space-y-1">
          <input
            ref={picker}
            type="file"
            name={crop ? undefined : name}
            accept="image/png,image/jpeg,image/webp"
            disabled={!enabled}
            onChange={onChange}
            className="block w-full text-sm text-neutral-600 file:mr-3 file:rounded-lg file:border file:border-neutral-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />
          {crop && <input ref={hidden} type="file" name={name} className="hidden" tabIndex={-1} aria-hidden />}
          {currentUrl && (
            <label className="flex items-center gap-2 text-xs text-neutral-500">
              <input type="checkbox" name={removeName} checked={remove} onChange={(e) => setRemove(e.target.checked)} /> Quitar imagen actual
            </label>
          )}
          {!enabled && <p className="text-xs text-amber-700">Subida de imágenes sin configurar (falta BLOB_READ_WRITE_TOKEN).</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <p className="text-xs text-neutral-400">{crop ? "PNG, JPG o WebP · después podés recortarla en círculo" : "PNG, JPG o WebP · máx. 2 MB"}</p>
        </div>
      </div>

      {cropSrc && <PhotoCropper src={cropSrc} onCancel={onCropCancel} onDone={onCropDone} />}
    </div>
  );
}
