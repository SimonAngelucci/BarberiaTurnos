"use client";

import { useCallback, useId, useRef, useState } from "react";
import { contrastFg, isHex } from "@/lib/format";

type HSV = { h: number; s: number; v: number }; // h 0-360, s y v 0-1

function hexToHsv(hex: string): HSV {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => x / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

function hsvToHex({ h, s, v }: HSV): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return "#" + [r, g, b].map((k) => Math.round((k + m) * 255).toString(16).padStart(2, "0")).join("");
}

const PRESETS = ["#111827", "#2563eb", "#7c3aed", "#db2777", "#dc2626", "#ea580c", "#16a34a", "#0d9488"];

/**
 * Selector de color con círculo cromático: el ángulo es el tono, la distancia al centro la intensidad y el deslizador el brillo.
 * También se puede escribir el código (#rrggbb) o elegir uno de los colores sugeridos. Con teclado: flechas sobre el círculo.
 * El valor viaja en un campo oculto `name` (hex de 6 dígitos), igual que antes con el selector nativo.
 */
export function ColorWheel({ name, defaultValue, label = "Color principal" }: { name: string; defaultValue: string; label?: string }) {
  const id = useId();
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(isHex(defaultValue) ? defaultValue : "#111827"));
  const [typed, setTyped] = useState<string | null>(null); // lo que se está escribiendo en el campo de texto
  const wheel = useRef<HTMLDivElement>(null);
  const hex = hsvToHex(hsv);
  const fg = contrastFg(hex);

  const fromPointer = useCallback((e: { clientX: number; clientY: number }) => {
    const el = wheel.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const radius = r.width / 2;
    const h = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
    const s = Math.min(1, Math.hypot(dx, dy) / radius);
    setTyped(null);
    setHsv((c) => ({ ...c, h, s }));
  }, []);

  const angle = (hsv.h * Math.PI) / 180;
  const dot = { left: `${50 + Math.cos(angle) * hsv.s * 50}%`, top: `${50 + Math.sin(angle) * hsv.s * 50}%` };

  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={hex} />
      <span className="label">{label}</span>
      <div className="flex flex-wrap items-center gap-5">
        <div
          ref={wheel}
          role="slider"
          data-no-swipe
          tabIndex={0}
          aria-label={`${label}: tono e intensidad`}
          aria-valuetext={hex}
          aria-valuemin={0}
          aria-valuemax={360}
          aria-valuenow={Math.round(hsv.h)}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            fromPointer(e);
          }}
          onPointerMove={(e) => e.buttons === 1 && fromPointer(e)}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 15 : 4;
            const k = e.key;
            if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(k)) return;
            e.preventDefault();
            setTyped(null);
            setHsv((c) => ({ ...c, h: k === "ArrowRight" ? (c.h + step) % 360 : k === "ArrowLeft" ? (c.h - step + 360) % 360 : c.h, s: k === "ArrowUp" ? Math.min(1, c.s + step / 100) : k === "ArrowDown" ? Math.max(0, c.s - step / 100) : c.s }));
          }}
          className="relative h-44 w-44 shrink-0 cursor-crosshair touch-none rounded-full shadow-inner outline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
          style={{ background: "radial-gradient(circle closest-side, #fff, rgba(255,255,255,0)), conic-gradient(from 90deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)" }}
        >
          {/* El brillo oscurece el círculo entero */}
          <div className="pointer-events-none absolute inset-0 rounded-full bg-black" style={{ opacity: 1 - hsv.v }} />
          <span className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-md ring-1 ring-black/30" style={{ ...dot, background: hex }} />
        </div>

        <div className="min-w-[11rem] flex-1 space-y-3">
          <div>
            <label htmlFor={`${id}-v`} className="mb-1 block text-xs font-medium text-neutral-500">
              Brillo
            </label>
            <input
              id={`${id}-v`}
              type="range"
              min={0}
              max={100}
              value={Math.round(hsv.v * 100)}
              onChange={(e) => {
                setTyped(null);
                setHsv((c) => ({ ...c, v: Number(e.target.value) / 100 }));
              }}
              className="h-3 w-full cursor-pointer appearance-none rounded-full"
              style={{ background: `linear-gradient(to right, #000, ${hsvToHex({ ...hsv, v: 1 })})` }}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="h-10 w-10 shrink-0 rounded-xl border border-neutral-300" style={{ background: hex }} aria-hidden />
            <div>
              <label htmlFor={`${id}-hex`} className="sr-only">
                Código del color
              </label>
              <input
                id={`${id}-hex`}
                value={typed ?? hex}
                maxLength={7}
                spellCheck={false}
                autoComplete="off"
                onChange={(e) => {
                  let v = e.target.value.trim();
                  if (v && !v.startsWith("#")) v = "#" + v;
                  setTyped(v);
                  if (isHex(v)) setHsv(hexToHsv(v));
                }}
                onBlur={() => setTyped(null)}
                className="input !w-28 font-mono uppercase"
                aria-invalid={typed !== null && !isHex(typed)}
              />
            </div>
          </div>
          {/* Vista previa: el botón con el texto que se va a usar encima del color */}
          <span className="inline-flex items-center rounded-xl px-4 py-2 text-sm font-semibold" style={{ background: hex, color: fg }}>
            Así se ven tus botones
          </span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Colores sugeridos">
        {PRESETS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Usar ${c}`}
            aria-pressed={hex.toLowerCase() === c}
            onClick={() => {
              setTyped(null);
              setHsv(hexToHsv(c));
            }}
            className={`h-8 w-8 rounded-full border-2 transition hover:scale-110 ${hex.toLowerCase() === c ? "border-neutral-900 ring-2 ring-neutral-300" : "border-white shadow ring-1 ring-black/10"}`}
            style={{ background: c }}
          />
        ))}
      </div>
      <p className="text-xs text-neutral-500">Se usa en botones y detalles de tu página y de tu panel. El texto sobre el color se ajusta solo para que se lea bien.</p>
    </div>
  );
}
