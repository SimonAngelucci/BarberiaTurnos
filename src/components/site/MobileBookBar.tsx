"use client";

import { useEffect, useState } from "react";

/**
 * Botón flotante «Reservar» (solo el botón, sin fondo) para celular. Aparece recién cuando se llega al final de la página y
 * se oculta mientras se está viendo (o completando) la reserva, que ya tiene sus propios botones. En pantallas grandes no se
 * usa: la tarjeta lateral acompaña.
 */
export function MobileBookBar({ targetId, label }: { targetId: string; label: string }) {
  const [atEnd, setAtEnd] = useState(false);
  const [inBooking, setInBooking] = useState(false);

  useEffect(() => {
    const check = () => {
      const doc = document.documentElement;
      setAtEnd(window.scrollY + window.innerHeight >= doc.scrollHeight - 320);
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, []);

  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(([e]) => setInBooking(e.isIntersecting), { rootMargin: "-20% 0px -20% 0px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [targetId]);

  const show = atEnd && !inBooking;

  return (
    <div
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] transition-all duration-300 lg:hidden ${show ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"}`}
      aria-hidden={!show}
    >
      <a href={`#${targetId}`} tabIndex={show ? 0 : -1} className={`btn !rounded-full !px-8 !py-3.5 text-base font-semibold shadow-xl shadow-black/25 ${show ? "pointer-events-auto" : ""}`}>
        {label}
      </a>
    </div>
  );
}
