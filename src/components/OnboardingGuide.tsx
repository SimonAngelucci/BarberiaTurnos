"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { setOnboardingStep } from "@/app/admin/onboarding-actions";

type StepInfo = { path: string; emoji: string; title: string; short: string; tips: string[]; next: string };

const STEPS: StepInfo[] = [
  {
    path: "/admin/services",
    emoji: "✂️",
    title: "Tus servicios y precios",
    short: "Servicios",
    tips: ["Editá los servicios de ejemplo (Corte y Barba) o creá los tuyos.", "Poné el precio y cuánto dura cada uno: así se arma la agenda.", "Podés ocultar los que no uses."],
    next: "Siguiente: Barberos",
  },
  {
    path: "/admin/barbers",
    emoji: "💈",
    title: "Tu equipo de barberos",
    short: "Barberos",
    tips: ["Cambiá «Barbero 1» por el nombre real y sumá a los demás.", "Subí una foto y una breve descripción de cada uno.", "Ajustá los días y horarios en que atiende cada barbero."],
    next: "Siguiente: Mi página",
  },
  {
    path: "/admin/profile",
    emoji: "🖼️",
    title: "Armá tu página pública",
    short: "Mi página",
    tips: ["Subí fotos de portada y de tu galería.", "Contá quiénes son en «Acerca de» y cargá tu política de reserva.", "Completá contacto, dirección y redes para que te encuentren."],
    next: "Terminar guía",
  },
];

/**
 * Guía de bienvenida para barberías nuevas: una pantalla de bienvenida y luego una tarjeta que acompaña por Servicios,
 * Barberos y Mi página. Se puede omitir en cualquier momento. El avance se guarda en la base (no vuelve a aparecer).
 */
export function OnboardingGuide({ initialStep, publicUrl }: { initialStep: number; publicUrl: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [step, setStep] = useState(initialStep);
  const [celebrate, setCelebrate] = useState(false);
  const [, startTransition] = useTransition();

  const save = (n: number) => {
    setStep(n);
    startTransition(() => {
      void setOnboardingStep(n);
    });
  };
  const go = (n: number, path?: string) => {
    save(n);
    if (path) router.push(path);
  };

  const confetti = useMemo(
    () =>
      celebrate
        ? Array.from({ length: 28 }, (_, i) => ({
            left: `${(i * 37) % 100}%`,
            delay: `${(i % 7) * 0.12}s`,
            dur: `${2.2 + (i % 5) * 0.35}s`,
            color: ["#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#8b5cf6"][i % 5],
          }))
        : [],
    [celebrate],
  );

  // Pantalla final de festejo (después de terminar los tres pasos)
  if (celebrate) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm ob-fade" role="dialog" aria-modal="true" aria-label="Guía terminada">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          {confetti.map((c, i) => (
            <span key={i} className="ob-confetti absolute -top-4 h-3 w-2 rounded-sm" style={{ left: c.left, background: c.color, animationDelay: c.delay, animationDuration: c.dur }} />
          ))}
        </div>
        <div className="card ob-pop relative w-full max-w-sm !p-8 text-center">
          <div className="ob-float text-6xl">🎉</div>
          <h2 className="mt-3 text-2xl font-bold">¡Tu barbería está lista!</h2>
          <p className="mt-2 text-sm text-neutral-600">Ya podés recibir reservas. Mirá cómo quedó tu página y compartí el link con tus clientes.</p>
          <div className="mt-5 flex flex-col gap-2">
            <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="btn !py-3" onClick={() => setCelebrate(false)}>
              Ver mi página
            </a>
            <button type="button" className="btn-ghost" onClick={() => setCelebrate(false)}>
              Seguir en el panel
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step >= 4) return null;

  // Bienvenida
  if (step === 0) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-gradient-to-br from-neutral-900/80 via-neutral-900/70 to-brand/60 p-4 backdrop-blur-md ob-fade" role="dialog" aria-modal="true" aria-label="Bienvenida">
        <div className="card ob-pop w-full max-w-md !p-7 text-center">
          <div className="ob-float text-6xl" aria-hidden>
            ✂️
          </div>
          <h2 className="mt-3 text-2xl font-bold tracking-tight">¡Bienvenido! Vamos a dejar todo listo</h2>
          <p className="mt-2 text-sm text-neutral-600">Te acompañamos en 3 pasos rápidos para que puedas recibir tus primeras reservas.</p>
          <ol className="mt-5 space-y-2 text-left">
            {STEPS.map((s, i) => (
              <li key={s.path} className="ob-rise flex items-center gap-3 rounded-xl bg-neutral-50 p-3" style={{ animationDelay: `${0.25 + i * 0.15}s` }}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-brand-fg">{i + 1}</span>
                <span className="text-sm">
                  <strong>{s.short}</strong>
                  <span className="block text-xs text-neutral-500">{s.title}</span>
                </span>
                <span aria-hidden className="ml-auto text-xl">
                  {s.emoji}
                </span>
              </li>
            ))}
          </ol>
          <button type="button" className="btn mt-6 w-full !py-3 text-base" onClick={() => go(1, STEPS[0].path)}>
            Empezar
          </button>
          <button type="button" className="mt-2 text-sm text-neutral-500 underline underline-offset-2 hover:text-neutral-800" onClick={() => save(4)}>
            Omitir por ahora
          </button>
        </div>
      </div>
    );
  }

  // Pasos 1 a 3: tarjeta inferior que acompaña
  const idx = step - 1;
  const info = STEPS[idx];
  const onPage = pathname === info.path || pathname.startsWith(info.path + "/");
  const last = idx === STEPS.length - 1;

  return (
    <>
      <div aria-hidden className="h-52" />
      <div className="fixed inset-x-0 bottom-0 z-50 px-3 pb-3 sm:pb-5" role="region" aria-label="Guía de configuración">
        <div key={step} className="card ob-slide mx-auto w-full max-w-lg !p-5 shadow-2xl shadow-black/20">
          <div className="mb-3 flex items-center gap-2" aria-label={`Paso ${step} de 3`}>
            {STEPS.map((s, i) => (
              <div key={s.path} className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-200">
                <div className={`h-full rounded-full bg-brand transition-all duration-700 ${i < idx ? "w-full" : i === idx ? "w-1/2" : "w-0"}`} />
              </div>
            ))}
            <span className="ml-1 text-xs font-medium text-neutral-500">{step}/3</span>
          </div>
          <div className="flex items-start gap-3">
            <span className="ob-float text-3xl" aria-hidden>
              {info.emoji}
            </span>
            <div className="min-w-0">
              <h2 className="font-bold leading-tight">{info.title}</h2>
              <ul className="mt-1.5 space-y-1 text-sm text-neutral-600">
                {info.tips.map((t) => (
                  <li key={t} className="flex gap-2">
                    <span className="text-brand" aria-hidden>
                      •
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <button type="button" className="text-sm text-neutral-500 underline underline-offset-2 hover:text-neutral-800" onClick={() => save(4)}>
              Omitir guía
            </button>
            {onPage ? (
              <button
                type="button"
                className="btn !px-5"
                onClick={() => {
                  if (last) {
                    save(4);
                    setCelebrate(true);
                  } else {
                    go(step + 1, STEPS[idx + 1].path);
                  }
                }}
              >
                {info.next} {last ? "🎉" : "→"}
              </button>
            ) : (
              <button type="button" className="btn !px-5" onClick={() => router.push(info.path)}>
                Ir a {info.short} →
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
