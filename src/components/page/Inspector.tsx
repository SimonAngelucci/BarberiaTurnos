"use client";

import Link from "next/link";
import { FONT_KEYS, FONTS, FX_KEYS, FX_LABELS, type Align, type Block, type FontKey, type FxKey, type PageConfig, type TextBlock } from "@/lib/page-config";
import { textStyle } from "./BlockView";
import { CLEAR_FX, TEXT_PRESETS } from "./presets";

export type AddType = "text" | "spacer" | "logo" | "title" | "tagline";
type Patch = (id: string, p: Record<string, unknown>, key?: string) => void;

const LABELS: Record<Block["type"], string> = { logo: "Logo", title: "Título", tagline: "Subtítulo", text: "Texto", spacer: "Espacio", booking: "Reservas" };

function Range({ label, value, min, max, step = 1, unit = "", onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-xs font-medium text-neutral-600">
        {label}
        <span className="tabular-nums text-neutral-400">
          {Number.isInteger(value) ? value : value.toFixed(2)}
          {unit}
        </span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-neutral-800" />
    </label>
  );
}

function Seg<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { v: T; t: string }[]; onChange: (v: T) => void }) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-neutral-600">{label}</span>
      <div className="grid auto-cols-fr grid-flow-col overflow-hidden rounded-lg border border-neutral-300">
        {options.map((o) => (
          <button
            key={String(o.v)}
            type="button"
            aria-pressed={o.v === value}
            onClick={() => onChange(o.v)}
            className={`px-2 py-1.5 text-xs font-medium ${o.v === value ? "bg-neutral-900 text-white" : "bg-white text-neutral-700 hover:bg-neutral-100"}`}
          >
            {o.t}
          </button>
        ))}
      </div>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string | null) => void }) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-neutral-600">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value ?? "#111827"}
          disabled={value === null}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-14 rounded-lg border border-neutral-300 disabled:opacity-40"
        />
        <label className="flex items-center gap-1.5 text-xs text-neutral-600">
          <input type="checkbox" checked={value === null} onChange={(e) => onChange(e.target.checked ? null : "#111827")} /> Automático (según el fondo)
        </label>
      </div>
    </div>
  );
}

function FontSelect({ label, value, onChange, inherit, classicOnly }: { label: string; value: FontKey | null; onChange: (v: FontKey | null) => void; inherit?: boolean; classicOnly?: boolean }) {
  const group = (g: "classic" | "display") => FONT_KEYS.filter((k) => FONTS[k].group === g);
  const opts = (g: "classic" | "display") =>
    group(g).map((k) => (
      <option key={k} value={k}>
        {FONTS[k].label}
      </option>
    ));
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-600">{label}</span>
      <select className="input !py-1.5 !text-sm" value={value ?? ""} onChange={(e) => onChange((e.target.value || null) as FontKey | null)}>
        {inherit && <option value="">Igual que la página</option>}
        <optgroup label="Clásicas">{opts("classic")}</optgroup>
        {/* La fuente general se usa también en el formulario de reservas: las llamativas quedan para títulos y carteles. */}
        {!classicOnly && <optgroup label="Con personalidad">{opts("display")}</optgroup>}
      </select>
    </label>
  );
}

/** Estilos rápidos de lettering con vista previa real de cada uno. */
function PresetGrid({ block, onPick }: { block: TextBlock; onPick: (v: Partial<TextBlock>) => void }) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-neutral-600">Estilos rápidos de letra</span>
      <div className="grid grid-cols-3 gap-1.5">
        {TEXT_PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            title={p.label}
            aria-label={`Estilo ${p.label}`}
            onClick={() => onPick(p.values)}
            style={{ background: p.tileBg }}
            className="flex h-14 flex-col items-center justify-center overflow-hidden rounded-lg border border-neutral-300 px-1 transition hover:scale-[1.03] hover:border-neutral-500 active:scale-95 motion-reduce:transition-none"
          >
            <span style={{ ...textStyle({ ...block, ...p.values } as TextBlock, 1.1), fontSize: 18, opacity: 1, color: (p.values.fx === "outline" || p.values.fx === "gradient") ? undefined : p.tileFg, transform: undefined, display: "inline-block", whiteSpace: "nowrap" }}>
              Barber
            </span>
            <span className="mt-0.5 text-[9px] font-medium" style={{ color: p.tileFg, opacity: 0.8 }}>
              {p.label}
            </span>
          </button>
        ))}
      </div>
      <button type="button" className="mt-1.5 text-xs text-neutral-500 underline" onClick={() => onPick(CLEAR_FX)}>
        Quitar efectos y volver a texto simple
      </button>
    </div>
  );
}

const ALIGN: { v: Align; t: string }[] = [
  { v: "left", t: "Izquierda" },
  { v: "center", t: "Centro" },
  { v: "right", t: "Derecha" },
];

export function Inspector({ cfg, block, patch, setGlobal, add, remove, duplicate, present }: {
  cfg: PageConfig;
  block: Block | null;
  patch: Patch;
  setGlobal: (p: Partial<PageConfig["global"]>, key?: string) => void;
  add: (t: AddType) => void;
  remove: (id: string) => void;
  duplicate: (id: string) => void;
  present: Set<string>;
}) {
  // ---------- Sin selección: ajustes de la página ----------
  if (!block) {
    const addable: { t: AddType; label: string }[] = [
      { t: "text", label: "+ Texto" },
      { t: "spacer", label: "+ Espacio" },
      { t: "logo", label: "+ Logo" },
      { t: "title", label: "+ Título" },
      { t: "tagline", label: "+ Subtítulo" },
    ];
    return (
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold">Página</h3>
          <p className="text-xs text-neutral-500">Tocá un elemento de la vista previa para editarlo. Doble clic sobre un texto para escribir.</p>
        </div>
        <FontSelect label="Tipografía general" classicOnly value={cfg.global.font} onChange={(v) => setGlobal({ font: v ?? "system" })} />
        <Range label="Ancho máximo de la página" value={cfg.global.maxWidth} min={360} max={1000} step={10} unit="px" onChange={(v) => setGlobal({ maxWidth: v }, "maxw")} />
        <Range label="Redondeo de las tarjetas" value={cfg.global.cardRadius} min={0} max={32} unit="px" onChange={(v) => setGlobal({ cardRadius: v }, "radius")} />
        <div>
          <span className="mb-1 block text-xs font-medium text-neutral-600">Agregar elemento</span>
          <div className="flex flex-wrap gap-1.5">
            {addable
              .filter((a) => !(["logo", "title", "tagline"] as string[]).includes(a.t) || !present.has(a.t))
              .map((a) => (
                <button key={a.t} type="button" className="btn-ghost !px-2.5 !py-1.5 text-xs" onClick={() => add(a.t)}>
                  {a.label}
                </button>
              ))}
          </div>
        </div>
        <p className="rounded-lg bg-neutral-50 p-2.5 text-xs text-neutral-500">
          El <strong>color de fondo</strong>, el <strong>color de botones</strong> y el <strong>logo</strong> se cambian en{" "}
          <Link href="/admin/personalizacion#negocio" className="underline">
            Negocio
          </Link>
          .
        </p>
      </div>
    );
  }

  const p = (o: Record<string, unknown>, key?: string) => patch(block.id, o, key ? `${key}:${block.id}` : undefined);
  const canRemove = block.type !== "booking";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{LABELS[block.type]}</h3>
        {canRemove && (
          <div className="flex gap-1.5">
            {block.type !== "logo" && block.type !== "title" && block.type !== "tagline" && (
              <button type="button" className="btn-ghost !px-2 !py-1 text-xs" onClick={() => duplicate(block.id)}>
                Duplicar
              </button>
            )}
            <button type="button" className="btn-ghost !px-2 !py-1 text-xs !text-red-600" onClick={() => remove(block.id)}>
              Eliminar
            </button>
          </div>
        )}
      </div>

      {block.type === "booking" && (
        <p className="rounded-lg bg-neutral-50 p-2.5 text-xs text-neutral-500">Es el formulario de reservas: no se puede eliminar, pero sí moverlo, achicarlo o agrandarlo.</p>
      )}

      {(block.type === "title" || block.type === "tagline" || block.type === "text") && (
        <>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">Texto</span>
            <textarea
              rows={block.type === "text" ? 3 : 2}
              maxLength={block.type === "text" ? 600 : 160}
              className="input !py-1.5 !text-sm"
              value={block.text ?? ""}
              placeholder={block.type === "text" ? "" : "Vacío = usar el del negocio"}
              onChange={(e) => p({ text: block.type === "text" ? e.target.value : e.target.value || null }, "text")}
            />
          </label>
          <PresetGrid block={block} onPick={(v) => p(v as Record<string, unknown>)} />
          <Seg label="Alineación" value={block.align} options={ALIGN} onChange={(v) => p({ align: v })} />
          <Range label="Tamaño de letra" value={block.size} min={10} max={96} unit="px" onChange={(v) => p({ size: v }, "size")} />
          <Seg
            label="Grosor"
            value={block.weight}
            options={[
              { v: 400, t: "Normal" },
              { v: 500, t: "Medio" },
              { v: 600, t: "Semi" },
              { v: 700, t: "Negrita" },
            ]}
            onChange={(v) => p({ weight: v })}
          />
          <FontSelect label="Tipografía" inherit value={block.font} onChange={(v) => p({ font: v })} />
          <ColorField label="Color del texto" value={block.color} onChange={(v) => p({ color: v }, "color")} />

          <div className="space-y-3 rounded-xl border border-neutral-200 p-3">
            <span className="block text-xs font-semibold text-neutral-700">Efectos de lettering</span>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-600">Efecto</span>
              <select className="input !py-1.5 !text-sm" value={block.fx} onChange={(e) => p({ fx: e.target.value as FxKey })}>
                {FX_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {FX_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            {(block.fx === "shadow" || block.fx === "neon" || block.fx === "gradient" || block.fx === "retro3d") && (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-neutral-600">{block.fx === "gradient" ? "Color final del degradé" : block.fx === "neon" ? "Color del brillo" : "Color de la sombra"}</span>
                <input type="color" value={block.fxColor} onChange={(e) => p({ fxColor: e.target.value }, "fxcolor")} className="h-9 w-14 rounded-lg border border-neutral-300" />
              </label>
            )}
            <Range label="Espacio entre letras" value={block.tracking} min={-4} max={24} unit="px" onChange={(v) => p({ tracking: v }, "tracking")} />
            <Range label="Inclinación" value={block.rotate} min={-12} max={12} unit="°" onChange={(v) => p({ rotate: v }, "rotate")} />
            <label className="flex items-center gap-2 text-xs font-medium text-neutral-600">
              <input type="checkbox" checked={block.caps} onChange={(e) => p({ caps: e.target.checked })} /> TODO EN MAYÚSCULAS
            </label>
          </div>
          <Range label="Transparencia" value={Math.round(block.opacity * 100)} min={20} max={100} unit="%" onChange={(v) => p({ opacity: v / 100 }, "opacity")} />
          <Range label="Ancho del bloque" value={block.widthPct} min={20} max={100} unit="%" onChange={(v) => p({ widthPct: v }, "width")} />
        </>
      )}

      {block.type === "logo" && (
        <>
          <Range label="Tamaño" value={block.size} min={32} max={240} unit="px" onChange={(v) => p({ size: v }, "size")} />
          <Seg
            label="Forma"
            value={block.shape}
            options={[
              { v: "circle", t: "Círculo" },
              { v: "rounded", t: "Redondeado" },
              { v: "square", t: "Cuadrado" },
            ]}
            onChange={(v) => p({ shape: v })}
          />
          <Seg label="Alineación" value={block.align} options={ALIGN} onChange={(v) => p({ align: v })} />
        </>
      )}

      {block.type === "spacer" && <Range label="Altura" value={block.height} min={0} max={240} unit="px" onChange={(v) => p({ height: v }, "height")} />}

      {block.type === "booking" && (
        <>
          <Range label="Ancho" value={block.widthPct} min={40} max={100} unit="%" onChange={(v) => p({ widthPct: v }, "width")} />
          <Range label="Tamaño de las tarjetas y botones" value={Math.round(block.scale * 100)} min={80} max={130} unit="%" onChange={(v) => p({ scale: v / 100 }, "scale")} />
          <ColorField label="Color de los títulos de sección" value={block.color} onChange={(v) => p({ color: v }, "color")} />
        </>
      )}

      {block.type !== "spacer" && (
        <div className="grid grid-cols-2 gap-3">
          <Range label="Espacio arriba" value={block.mt} min={0} max={120} unit="px" onChange={(v) => p({ mt: v }, "mt")} />
          <Range label="Espacio abajo" value={block.mb} min={0} max={120} unit="px" onChange={(v) => p({ mb: v }, "mb")} />
        </div>
      )}
    </div>
  );
}
