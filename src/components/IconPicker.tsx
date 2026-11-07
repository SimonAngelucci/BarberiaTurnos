"use client";

import { useId, useState } from "react";
import { ImageField } from "./ImageField";
import { ServiceIcon } from "./ServiceIcon";
import { DEFAULT_ICON, iconChoices, isIconKey, type BusinessType } from "@/lib/service-icons";

/**
 * Selector de ícono de un servicio: lista del rubro + generales, o una imagen propia.
 * Campos que viajan: iconKey (el elegido), iconPick=1 (si tocó uno de la lista), iconUrl / removeIcon (de ImageField).
 */
export function IconPicker({ type, iconKey, iconUrl, enabled }: { type: BusinessType; iconKey: string | null; iconUrl: string | null; enabled: boolean }) {
  const name = useId();
  const [picked, setPicked] = useState(false);
  const [key, setKey] = useState(isIconKey(iconKey) ? iconKey : DEFAULT_ICON[type]);
  // Mientras tenga imagen propia (y no haya tocado uno de la lista), ninguno de la lista aparece marcado.
  const usingCustom = !!iconUrl && !picked;

  return (
    <div className="space-y-2">
      <span className="label">Ícono</span>
      <input type="hidden" name="iconPick" value={picked ? "1" : ""} />
      <div role="radiogroup" aria-label="Ícono del servicio" className="grid grid-cols-5 gap-1.5 sm:grid-cols-8">
        {iconChoices(type).map((c) => {
          const on = !usingCustom && key === c.key;
          return (
            <label key={c.key} title={c.label} className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border p-1.5 text-center transition ${on ? "border-brand ring-2 ring-brand/30" : "border-neutral-200 hover:border-neutral-400"}`}>
              <input
                type="radio"
                name={`${name}-key`}
                className="sr-only"
                checked={on}
                onChange={() => {
                  setKey(c.key);
                  setPicked(true);
                }}
              />
              <ServiceIcon iconKey={c.key} type={type} size={36} />
              <span className="line-clamp-2 text-[10px] leading-tight text-neutral-500">{c.label}</span>
            </label>
          );
        })}
      </div>
      <input type="hidden" name="iconKey" value={key} />
      <div className="rounded-xl bg-neutral-50 p-2">
        <ImageField name="iconUrl" removeName="removeIcon" kind="service" label="O subí tu propio ícono" currentUrl={iconUrl} enabled={enabled} size={52} />
        {usingCustom && <p className="mt-1 text-xs text-neutral-500">Ahora se usa tu ícono propio. Si elegís uno de la lista, lo reemplaza.</p>}
      </div>
    </div>
  );
}
