"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type GalleryItem = { url: string; type: "IMAGE" | "VIDEO"; poster: string | null };

/**
 * Video corto de la galería: sin controles, mudo y en bucle. No descarga nada hasta que está cerca de la pantalla (muestra la
 * portada), se reproduce solo mientras se ve y se pausa al salir. Con «reducir movimiento» o ahorro de datos queda la portada.
 * El tamaño lo da el contenedor (cuadrado), así que no mueve el diseño al cargar.
 */
function AutoVideo({ src, poster, className = "" }: { src: string; poster: string | null; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [armed, setArmed] = useState(false); // ya se le puso el `src` (cerca de la pantalla)
  const [still, setStill] = useState(false); // solo portada

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const saveData = (navigator as unknown as { connection?: { saveData?: boolean } }).connection?.saveData === true;
    if (reduced || saveData) {
      setStill(true);
      return;
    }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setArmed(true);
        const v = ref.current;
        if (!v) return;
        if (e.isIntersecting && e.intersectionRatio >= 0.4) void v.play().catch(() => {});
        else v.pause();
      },
      { rootMargin: "200px", threshold: [0, 0.4] },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Al ponerle el src, arranca solo si sigue a la vista.
  useEffect(() => {
    if (armed) void ref.current?.play().catch(() => {});
  }, [armed]);

  return (
    <video
      ref={ref}
      src={armed && !still ? src : undefined}
      poster={poster ?? undefined}
      muted
      loop
      playsInline
      preload="none"
      disablePictureInPicture
      aria-hidden
      className={className}
    />
  );
}

/**
 * Galería de fotos y videos cortos en fila deslizable; al tocar uno se abre ampliado y se navega con flechas, teclado o
 * deslizando. Incluye el acceso directo para reservar.
 */
// Proporciones que se van alternando en el collage para que las piezas no sean todas iguales (altura = ancho × número).
const COLLAGE_RATIOS = ["125%", "100%", "150%", "80%", "110%", "135%"];

export function Gallery({ items, visible = 4, showAll = false, allHref, bookHref, bookLabel = "Reservar turno" }: { items: GalleryItem[]; visible?: number; showAll?: boolean; allHref?: string; bookHref?: string; bookLabel?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const track = useRef<HTMLUListElement>(null);
  const n = items.length;
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

  const slide = (d: number) => track.current?.scrollBy({ left: d * track.current.clientWidth * 0.9, behavior: "smooth" });
  let startX: number | null = null;
  const cur = open !== null ? items[open] : null;

  return (
    <>
      {showAll ? (
        // Collage: todas las piezas, en columnas, con alturas distintas (masonry). Tocar una la abre ampliada.
        <ul className="columns-2 gap-2 sm:columns-3 lg:columns-3">
          {items.map((it, i) => (
            <li key={it.url} className="mb-2 break-inside-avoid">
              <button type="button" onClick={() => setOpen(i)} aria-label={it.type === "VIDEO" ? `Ampliar video ${i + 1}` : `Ampliar foto ${i + 1}`} className="group relative block w-full overflow-hidden rounded-sm bg-neutral-200">
                <span className="block" style={{ paddingBottom: COLLAGE_RATIOS[i % COLLAGE_RATIOS.length] }} />
                {it.type === "VIDEO" ? (
                  <AutoVideo src={it.url} poster={it.poster} className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.url} alt={`Foto ${i + 1} de la galería`} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : (
      <div className="relative">
        {/* Fila deslizable: se ven `visible` elementos (2 como máximo en celular) y el resto queda hacia el costado */}
        <ul
          ref={track}
          className="gallery-track no-scrollbar flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-smooth"
          style={{ ["--cols-sm" as string]: Math.min(visible, 2), ["--cols" as string]: visible }}
        >
          {items.map((it, i) => (
            <li key={it.url} className="gallery-item snap-start">
              <button type="button" onClick={() => setOpen(i)} aria-label={it.type === "VIDEO" ? `Ampliar video ${i + 1}` : `Ampliar foto ${i + 1}`} className="relative block aspect-square w-full overflow-hidden rounded-sm bg-neutral-200">
                {it.type === "VIDEO" ? (
                  <AutoVideo src={it.url} poster={it.poster} className="h-full w-full object-cover" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.url} alt={`Foto ${i + 1} de la galería`} loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-300 hover:scale-105" />
                )}
              </button>
            </li>
          ))}
        </ul>
        {n > visible && (
          <>
            <button type="button" aria-label="Anteriores" onClick={() => slide(-1)} className="absolute left-1 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/90 px-3 py-2 text-xl shadow-md hover:bg-white sm:block">
              ‹
            </button>
            <button type="button" aria-label="Siguientes" onClick={() => slide(1)} className="absolute right-1 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/90 px-3 py-2 text-xl shadow-md hover:bg-white sm:block">
              ›
            </button>
          </>
        )}
      </div>
      )}

      {allHref && (
        <div className="mt-5 text-center">
          <a href={allHref} className="btn-ghost !rounded-full !px-7 !py-3 font-semibold">
            Mostrar galería
          </a>
        </div>
      )}

      {bookHref && (
        <div className="mt-5 text-center">
          <a href={bookHref} className="btn !rounded-full !px-7 !py-3 font-semibold shadow-md">
            {bookLabel}
          </a>
        </div>
      )}

      {cur && open !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Galería"
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
          {cur.type === "VIDEO" ? (
            <video
              key={cur.url}
              src={cur.url}
              poster={cur.poster ?? undefined}
              autoPlay
              muted
              loop
              playsInline
              disablePictureInPicture
              className="max-h-[80vh] max-w-full rounded-sm bg-black object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cur.url} alt={`Foto ${open + 1} de ${n}`} className="max-h-[80vh] max-w-full rounded-sm object-contain" onClick={(e) => e.stopPropagation()} />
          )}
          <button type="button" aria-label="Cerrar" onClick={() => setOpen(null)} className="absolute right-3 top-3 rounded-full bg-white/15 px-3 py-1.5 text-lg text-white hover:bg-white/30">
            ✕
          </button>
          {n > 1 && (
            <>
              <button type="button" aria-label="Anterior" onClick={(e) => { e.stopPropagation(); step(-1); }} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/15 px-3 py-2 text-2xl text-white hover:bg-white/30">
                ‹
              </button>
              <button type="button" aria-label="Siguiente" onClick={(e) => { e.stopPropagation(); step(1); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/15 px-3 py-2 text-2xl text-white hover:bg-white/30">
                ›
              </button>
              <span className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-sm text-white">
                {open + 1} / {n}
              </span>
            </>
          )}
          {bookHref && (
            <a
              href={bookHref}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(null);
              }}
              className="btn absolute bottom-5 left-1/2 -translate-x-1/2 !rounded-full !px-7 !py-3 font-semibold shadow-xl"
            >
              {bookLabel}
            </a>
          )}
        </div>
      )}
    </>
  );
}
