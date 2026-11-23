"use client";

import { startTransition, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PrefetchKind } from "next/dist/client/components/router-reducer/router-reducer-types";

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

  // Precarga COMPLETA (con datos) de todas las pestañas apenas carga el panel, renovada cada minuto mientras la pantalla está
  // visible: así la caché del router siempre está vigente y el cambio de pestaña no espera al servidor. (La precarga «auto» de
  // Next no trae los datos de las páginas dinámicas, y la caché vencía a los 30 s.)
  useEffect(() => {
    if (idx < 0) return;
    const warm = () => {
      if (document.visibilityState !== "visible") return;
      for (const t of tabs) if (t !== path) router.prefetch(t, { kind: PrefetchKind.FULL });
    };
    const first = setTimeout(warm, 600);
    const every = setInterval(warm, 60_000);
    document.addEventListener("visibilitychange", warm);
    return () => {
      clearTimeout(first);
      clearInterval(every);
      document.removeEventListener("visibilitychange", warm);
    };
  }, [idx, tabs, path, router]);

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
    el.style.transition = "transform .26s cubic-bezier(.2,.8,.2,1), opacity .26s ease-out";
    el.style.transform = "translateX(0)";
    el.style.opacity = "1";
    const t = setTimeout(() => clear(el), 300);
    return () => clearTimeout(t);
  }, [path]);

  useEffect(() => {
    const el = root.current;
    const content = box.current;
    if (!el || !content) return;

    /** Sale la página actual hacia `dir` (1 = a la izquierda, entra la siguiente) y navega. */
    const go = (href: string, dir: 1 | -1, tap = false) => {
      if (busy.current) return;
      busy.current = true;
      enter.current = dir;
      window.dispatchEvent(new CustomEvent(EV_INTENT, { detail: href }));
      const fast = reduced();
      const out = tap ? 0.1 : 0.17; // al tocar un ícono la salida es más corta: no hay dedo que ya haya movido la página
      content.style.transition = fast ? "none" : `transform ${out}s cubic-bezier(.4,.1,.6,1), opacity ${out}s ease-in`;
      router.prefetch(href, { kind: PrefetchKind.FULL }); // arranca ya: la animación de salida y el pedido al servidor van en paralelo
      content.style.transform = `translateX(${-dir * 100}%)`;
      content.style.opacity = fast ? "1" : "0.4";
      setTimeout(() => startTransition(() => router.push(href)), fast ? 0 : out * 1000 - 10);
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
      go(href, to > idx ? 1 : -1, true);
    };
    window.addEventListener(EV_GO, onGo);

    let start: { x: number; y: number; t: number; id: number } | null = null;
    let lock: "h" | "v" | null = null;
    let dx = 0;
    let frame = 0;

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
      // El movimiento se aplica una vez por cuadro (requestAnimationFrame), no en cada evento del dedo.
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const edge = (dx > 0 && idx === 0) || (dx < 0 && idx === tabs.length - 1);
        content.style.transition = "none";
        content.style.transform = `translateX(${edge ? dx * 0.25 : dx}px)`; // en los extremos «hace resistencia»
      });
    };
    const up = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      const s = start;
      start = null;
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
        const edge = (dx > 0 && idx === 0) || (dx < 0 && idx === tabs.length - 1);
        content.style.transition = "none";
        content.style.transform = `translateX(${edge ? dx * 0.25 : dx}px)`;
      }
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

    el.addEventListener("pointerdown", down, { passive: true });
    el.addEventListener("pointermove", move, { passive: true });
    el.addEventListener("pointerup", up, { passive: true });
    el.addEventListener("pointercancel", cancel, { passive: true });
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
