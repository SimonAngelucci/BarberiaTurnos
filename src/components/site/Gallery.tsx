"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Grilla de fotos; al tocar una se abre ampliada y se navega con flechas, teclado o deslizando. */
export function Gallery({ photos, visible = 4 }: { photos: string[]; visible?: number }) {
  const [open, setOpen] = useState<number | null>(null);
  const track = useRef<HTMLUListElement>(null);
  const n = photos.length;
  const step = useCallback((d: number) => setOpen((x) => (x === null ? x : (x + d + n) % n)), [n]);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // la página de atrás no se mueve
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, step]);

  let startX: number | null = null;

  const slide = (d: number) => track.current?.scrollBy({ left: d * track.current.clientWidth * 0.9, behavior: "smooth" });

  return (
    <>
      <div className="relative">
        {/* Fila deslizable: se ven `visible` fotos (2 como máximo en celular) y el resto queda hacia el costado */}
        <ul
          ref={track}
          className="gallery-track no-scrollbar flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-smooth"
          style={{ ["--cols-sm" as string]: Math.min(visible, 2), ["--cols" as string]: visible }}
        >
          {photos.map((src, i) => (
            <li key={src} className="gallery-item snap-start">
              <button type="button" onClick={() => setOpen(i)} aria-label={`Ampliar foto ${i + 1}`} className="block aspect-square w-full overflow-hidden rounded-sm bg-neutral-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`Foto ${i + 1} de la galería`} loading="lazy" className="h-full w-full object-cover transition duration-300 hover:scale-105" />
              </button>
            </li>
          ))}
        </ul>
        {n > visible && (
          <>
            <button type="button" aria-label="Fotos anteriores" onClick={() => slide(-1)} className="absolute left-1 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/90 px-3 py-2 text-xl shadow-md hover:bg-white sm:block">
              ‹
            </button>
            <button type="button" aria-label="Fotos siguientes" onClick={() => slide(1)} className="absolute right-1 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/90 px-3 py-2 text-xl shadow-md hover:bg-white sm:block">
              ›
            </button>
          </>
        )}
      </div>

      {open !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Galería de fotos"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setOpen(null)}
          onTouchStart={(e) => {
            startX = e.touches[0].clientX;
          }}
          onTouchEnd={(e) => {
            if (startX === null) return;
            const dx = e.changedTouches[0].clientX - startX;
            startX = null;
            if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photos[open]} alt={`Foto ${open + 1} de ${n}`} className="max-h-[88vh] max-w-full rounded-sm object-contain" onClick={(e) => e.stopPropagation()} />
          <button type="button" aria-label="Cerrar" onClick={() => setOpen(null)} className="absolute right-3 top-3 rounded-full bg-white/15 px-3 py-1.5 text-lg text-white hover:bg-white/30">
            ✕
          </button>
          {n > 1 && (
            <>
              <button type="button" aria-label="Foto anterior" onClick={(e) => { e.stopPropagation(); step(-1); }} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/15 px-3 py-2 text-2xl text-white hover:bg-white/30">
                ‹
              </button>
              <button type="button" aria-label="Foto siguiente" onClick={(e) => { e.stopPropagation(); step(1); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/15 px-3 py-2 text-2xl text-white hover:bg-white/30">
                ›
              </button>
              <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-sm text-white">
                {open + 1} / {n}
              </span>
            </>
          )}
        </div>
      )}
    </>
  );
}
