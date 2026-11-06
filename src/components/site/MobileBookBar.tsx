"use client";

import { useEffect, useState } from "react";

/**
 * Botón «Reservar» fijo abajo en celular, para tenerlo siempre al alcance del pulgar. Se oculta mientras se está viendo
 * (o completando) la reserva, que ya tiene sus propios botones, y en pantallas grandes, donde la tarjeta lateral acompaña.
 */
export function MobileBookBar({ targetId, label }: { targetId: string; label: string }) {
  const [show, setShow] = useState(true);

  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(([e]) => setShow(!e.isIntersecting), { rootMargin: "-20% 0px -20% 0px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [targetId]);

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-black/10 bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur transition-transform duration-300 lg:hidden ${show ? "translate-y-0" : "translate-y-full"}`}
      aria-hidden={!show}
    >
      <a href={`#${targetId}`} tabIndex={show ? 0 : -1} className="btn w-full !rounded-2xl !py-3.5 text-base font-semibold shadow-md">
        {label}
      </a>
    </div>
  );
}
