"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

/** Eventos entre el menú inferior y el contenedor: «ir a esta pestaña» (con animación) y «voy a esta pestaña» (mueve el círculo ya). */
const EV_GO = "panel-nav-go";
export const EV_INTENT = "panel-nav-intent";

/** Lleva a una pestaña con la misma animación que el swipe (la usa el menú inferior al tocar un ícono). */
export function goToTab(href: string) {
  window.dispatchEvent(new CustomEvent(EV_GO, { detail: href }));
}

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** ¿El gesto empezó sobre algo que tiene su propio gesto horizontal? (carruseles, calendario, sliders, campos, diálogos) */
function ownsHorizontalGesture(target: EventTarget | null, root: HTMLElement) {
  let el = target as HTMLElement | null;
  while (el && el !== root) {
    if (el.matches?.("input, textarea, select, canvas, [role=slider], [role=dialog], [aria-modal=true], [data-no-swipe]")) return true;
    const s = getComputedStyle(el);
    if ((s.overflowX === "auto" || s.overflowX === "scroll") && el.scrollWidth > el.clientWidth + 1) return true;
    el = el.parentElement;
  }
  return false;
}

/**
 * Páginas con swipe. `tabs` son las rutas de las pestañas principales, en orden. Parado en la raíz de una pestaña, deslizar
 * mueve la página completa: sigue al dedo y, al soltar, sale entera hacia un lado mientras entra la nueva desde el otro (o
 * rebota a su lugar si no pasó el umbral). Cada pestaña sigue siendo una ruta: la URL cambia, atrás y los links directos
 * funcionan, y las vecinas se precargan. El gesto se ignora si es más vertical que horizontal o si empieza sobre un elemento
 * con scroll horizontal propio. En reposo no queda ninguna transformación (para no romper elementos sticky/fixed de adentro).
 */
export function SwipeShell({ tabs, children }: { tabs: string[]; children: React.ReactNode }) {
  const path = usePathname() ?? "";
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const enter = useRef<1 | -1 | 0>(0); // 1: la página nueva entra desde la derecha, -1: desde la izquierda
  const busy = useRef(false);
  const idx = tabs.indexOf(path); // -1 si no estamos en la raíz de una pestaña (ej: Clientes): sin swipe

  const clear = (el: HTMLElement) => {
    el.style.transition = "";
    el.style.transform = "";
    el.style.opacity = "";
  };

  // Precarga de las pestañas vecinas: el cambio es casi instantáneo.
  useEffect(() => {
    if (idx < 0) return;
    if (tabs[idx - 1]) router.prefetch(tabs[idx - 1]);
    if (tabs[idx + 1]) router.prefetch(tabs[idx + 1]);
  }, [idx, tabs, router]);

  // Llegó la página nueva: entra deslizando desde el lado opuesto al que salió la anterior.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    busy.current = false;
    const d = enter.current;
    enter.current = 0;
    if (!d || reduced()) return clear(el);
    el.style.transition = "none";
    el.style.transform = `translateX(${d * 100}%)`;
    el.style.opacity = "0.4";
    void el.offsetWidth; // fuerza el reflow para que la transición arranque desde acá
    el.style.transition = "transform .3s cubic-bezier(.2,.8,.2,1), opacity .3s ease-out";
    el.style.transform = "translateX(0)";
    el.style.opacity = "1";
    const t = setTimeout(() => clear(el), 340);
    return () => clearTimeout(t);
  }, [path]);

  useEffect(() => {
    const el = root.current;
    const content = box.current;
    if (!el || !content) return;

    /** Sale la página actual hacia `dir` (1 = a la izquierda, entra la siguiente) y navega. */
    const go = (href: string, dir: 1 | -1) => {
      if (busy.current) return;
      busy.current = true;
      enter.current = dir;
      window.dispatchEvent(new CustomEvent(EV_INTENT, { detail: href }));
      const fast = reduced();
      content.style.transition = fast ? "none" : "transform .22s cubic-bezier(.4,.1,.6,1), opacity .22s ease-in";
      content.style.transform = `translateX(${-dir * 100}%)`;
      content.style.opacity = fast ? "1" : "0.4";
      setTimeout(() => router.push(href), fast ? 0 : 200);
      // Red de seguridad: si por algo no se llegó a navegar, la página vuelve sola.
      setTimeout(() => {
        if (busy.current && tabs.indexOf(window.location.pathname) === idx) {
          busy.current = false;
          enter.current = 0;
          clear(content);
        }
      }, 4000);
    };

    const bounce = () => {
      content.style.transition = reduced() ? "none" : "transform .4s cubic-bezier(.34,1.56,.64,1)";
      content.style.transform = "translateX(0)";
      setTimeout(() => clear(content), 420);
    };

    const onGo = (e: Event) => {
      const href = (e as CustomEvent<string>).detail;
      const to = tabs.indexOf(href);
      if (idx < 0 || to < 0 || to === idx) return router.push(href);
      go(href, to > idx ? 1 : -1);
    };
    window.addEventListener(EV_GO, onGo);

    let start: { x: number; y: number; t: number; id: number } | null = null;
    let lock: "h" | "v" | null = null;
    let dx = 0;

    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || !e.isPrimary || busy.current || idx < 0) return;
      if (ownsHorizontalGesture(e.target, el)) return;
      start = { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId };
      lock = null;
      dx = 0;
    };
    const move = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      const mx = e.clientX - start.x;
      const my = e.clientY - start.y;
      if (!lock) {
        if (Math.abs(mx) < 10 && Math.abs(my) < 10) return;
        if (Math.abs(mx) > Math.abs(my) * 1.3) {
          lock = "h";
          el.setPointerCapture(e.pointerId);
        } else {
          start = null; // más vertical que horizontal: es scroll
          return;
        }
      }
      dx = mx;
      const edge = (dx > 0 && idx === 0) || (dx < 0 && idx === tabs.length - 1);
      content.style.transition = "none";
      content.style.transform = `translateX(${edge ? dx * 0.25 : dx}px)`; // en los extremos «hace resistencia»
    };
    const up = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      const s = start;
      start = null;
      if (lock !== "h") return;
      lock = null;
      const dir: 1 | -1 = dx < 0 ? 1 : -1;
      const target = tabs[idx + dir];
      const fast = Math.abs(dx) > 40 && Math.abs(dx) / Math.max(1, e.timeStamp - s.t) > 0.45; // un «flick» rápido también cuenta
      if (target && (Math.abs(dx) > el.clientWidth * 0.28 || fast)) go(target, dir);
      else bounce();
    };
    const cancel = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      const wasH = lock === "h";
      start = null;
      lock = null;
      if (wasH) bounce();
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener(EV_GO, onGo);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
    };
  }, [idx, tabs, router]);

  return (
    // touch-action: el navegador sigue haciendo el scroll vertical y el zoom con dos dedos; el movimiento horizontal lo manejamos acá.
    <div ref={root} className="-mx-4 min-h-[70vh] overflow-x-clip px-4" style={{ touchAction: "pan-y pinch-zoom" }}>
      <div ref={box} className="will-change-auto">
        {children}
      </div>
    </div>
  );
}
