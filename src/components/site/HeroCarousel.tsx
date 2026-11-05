"use client";

import { useEffect, useRef, useState } from "react";

const INTERVAL_MS = 5500;

/**
 * Portada con las fotos de la barbería: pasan solas con un fundido suave. Se detiene al pasar el mouse / tocar / enfocar,
 * con la pestaña oculta y si la persona pidió «reducir movimiento». Se puede cambiar con los puntos o deslizando.
 */
export function HeroCarousel({ photos, name, tagline, logoUrl, ctaHref }: { photos: string[]; name: string; tagline: string; logoUrl: string | null; ctaHref: string }) {
  const [i, setI] = useState(0);
  const [held, setHeld] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [reduced, setReduced] = useState(false);
  const touchX = useRef<number | null>(null);
  const n = photos.length;

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onMq = () => setReduced(mq.matches);
    const onVis = () => setHidden(document.hidden);
    mq.addEventListener("change", onMq);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      mq.removeEventListener("change", onMq);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  useEffect(() => {
    if (n < 2 || held || hidden || reduced) return;
    const t = setInterval(() => setI((x) => (x + 1) % n), INTERVAL_MS);
    return () => clearInterval(t);
  }, [n, held, hidden, reduced, i]); // `i` reinicia el reloj cuando se cambia a mano

  const go = (d: number) => setI((x) => (x + d + n) % n);

  return (
    <div
      id="inicio"
      className="relative isolate h-[70vh] max-h-[640px] min-h-[400px] w-full overflow-hidden bg-neutral-900 text-white"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
      onTouchStart={(e) => {
        touchX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        const start = touchX.current;
        touchX.current = null;
        if (start === null || n < 2) return;
        const dx = e.changedTouches[0].clientX - start;
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
      }}
    >
      {photos.map((src, k) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt=""
          aria-hidden={k !== i}
          loading={k === 0 ? "eager" : "lazy"}
          fetchPriority={k === 0 ? "high" : "auto"}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ease-in-out motion-reduce:transition-none ${k === i ? "opacity-100" : "opacity-0"}`}
        />
      ))}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-black/25" />

      <div className="absolute inset-x-0 bottom-0 mx-auto flex max-w-2xl flex-col items-center gap-3 px-6 pb-14 text-center">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="h-20 w-20 rounded-full bg-white object-cover shadow-lg ring-2 ring-white/70" />
        )}
        <h1 className="text-balance text-3xl font-bold leading-tight drop-shadow sm:text-5xl">{name}</h1>
        {tagline && <p className="text-balance text-base text-white/85 drop-shadow sm:text-lg">{tagline}</p>}
        <a href={ctaHref} className="btn mt-2 !px-6 !py-3 shadow-lg ring-2 ring-white/70">
          Reservar turno
        </a>
      </div>

      {n > 1 && (
        <div className="absolute inset-x-0 bottom-4 flex justify-center gap-2" role="tablist" aria-label="Fotos de la portada">
          {photos.map((_, k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={k === i}
              aria-label={`Foto ${k + 1} de ${n}`}
              onClick={() => setI(k)}
              className={`h-2 rounded-full transition-all ${k === i ? "w-6 bg-white" : "w-2 bg-white/50 hover:bg-white/80"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
