"use client";

import { useEffect, useState } from "react";

const MAX = 2 * 1024 * 1024;

/**
 * Selector de imagen con vista previa. Valida tipo/tamaño en el cliente (el servidor vuelve a validar).
 * Envía el archivo en `name` y, si hay imagen actual, un checkbox `remove<Name>` para quitarla.
 */
export function ImageField({
  name,
  removeName,
  label,
  currentUrl,
  enabled,
  round = true,
  size = 72,
}: {
  name: string;
  removeName: string;
  label: string;
  currentUrl: string | null;
  enabled: boolean;
  round?: boolean;
  size?: number;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [remove, setRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setError(null);
    if (!f) return setPreview(null);
    if (!["image/png", "image/jpeg", "image/webp"].includes(f.type)) {
      e.target.value = "";
      setPreview(null);
      return setError("Usá una imagen PNG, JPG o WebP");
    }
    if (f.size > MAX) {
      e.target.value = "";
      setPreview(null);
      return setError("La imagen supera los 2 MB");
    }
    setRemove(false);
    setPreview(URL.createObjectURL(f));
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
            type="file"
            name={name}
            accept="image/png,image/jpeg,image/webp"
            disabled={!enabled}
            onChange={onChange}
            className="block w-full text-sm text-neutral-600 file:mr-3 file:rounded-lg file:border file:border-neutral-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />
          {currentUrl && (
            <label className="flex items-center gap-2 text-xs text-neutral-500">
              <input type="checkbox" name={removeName} checked={remove} onChange={(e) => setRemove(e.target.checked)} /> Quitar imagen actual
            </label>
          )}
          {!enabled && <p className="text-xs text-amber-700">Subida de imágenes sin configurar (falta BLOB_READ_WRITE_TOKEN).</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <p className="text-xs text-neutral-400">PNG, JPG o WebP · máx. 2 MB</p>
        </div>
      </div>
    </div>
  );
}
