"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { SaveForm } from "./SaveForm";
import { cancelAppointment, markAppointmentPaid, setAppointmentStatus } from "@/app/admin/actions";

export type BoardAppt = {
  id: string;
  startAt: string;
  endAt: string;
  customer: string;
  phone: string;
  service: string;
  barber: string | null;
  paid: "PAID" | "DEPOSIT" | "STORE" | "NONE";
  paidLabel: string;
};

type Tier = { key: "now" | "imminent" | "soon" | "near" | "later" | "future"; badge: string; card: string; time: string; pill: string };

/** Urgencia según cuánto falta: cuanto más cerca, más fuerte el color de alerta. */
function tierOf(a: BoardAppt, nowMs: number, sameDay: boolean): Tier {
  const start = new Date(a.startAt).getTime();
  const end = new Date(a.endAt).getTime();
  const min = (start - nowMs) / 60_000;
  if (nowMs >= start && nowMs < end) return { key: "now", badge: "En curso", card: "border-emerald-400 bg-emerald-50", time: "text-emerald-700", pill: "bg-emerald-600 text-white" };
  if (min <= 15) return { key: "imminent", badge: min <= 1 ? "¡Ahora!" : `En ${Math.ceil(min)} min`, card: "border-red-500 bg-red-50 ring-2 ring-red-300 urgent-pulse", time: "text-red-700", pill: "bg-red-600 text-white" };
  if (min <= 60) return { key: "soon", badge: `En ${Math.ceil(min)} min`, card: "border-amber-400 bg-amber-100", time: "text-amber-800", pill: "bg-amber-500 text-black" };
  if (min <= 180) return { key: "near", badge: `En ${Math.floor(min / 60)} h ${Math.round(min % 60)} min`, card: "border-yellow-300 bg-yellow-50", time: "text-yellow-800", pill: "bg-yellow-300 text-black" };
  return sameDay
    ? { key: "later", badge: "Hoy", card: "border-neutral-200 bg-white", time: "text-neutral-900", pill: "bg-neutral-200 text-neutral-800" }
    : { key: "future", badge: "", card: "border-neutral-200 bg-white", time: "text-neutral-900", pill: "bg-neutral-100 text-neutral-700" };
}

const PAY: Record<BoardAppt["paid"], string> = {
  PAID: "bg-green-100 text-green-800",
  DEPOSIT: "bg-blue-100 text-blue-800",
  STORE: "bg-orange-100 text-orange-800",
  NONE: "bg-neutral-100 text-neutral-600",
};

/**
 * Vista de Turnos a pantalla completa: próximos turnos ordenados, con color de alerta según la cercanía
 * (en curso, ≤15 min, ≤1 h, ≤3 h). Se actualiza sola: recalcula los colores cada 20 s y trae datos nuevos cada minuto.
 */
export function TurnosBoard({ appts, tz }: { appts: BoardAppt[]; tz: string }) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 20_000);
    const refresh = setInterval(() => document.visibilityState === "visible" && router.refresh(), 60_000);
    return () => {
      clearInterval(tick);
      clearInterval(refresh);
    };
  }, [router]);

  const groups = useMemo(() => {
    const today = DateTime.fromMillis(now).setZone(tz).startOf("day");
    const map = new Map<string, { label: string; sameDay: boolean; items: BoardAppt[] }>();
    for (const a of appts) {
      const d = DateTime.fromISO(a.startAt).setZone(tz).setLocale("es");
      const key = d.toISODate()!;
      const diff = Math.round(d.startOf("day").diff(today, "days").days);
      const label = diff <= 0 ? "Hoy" : diff === 1 ? "Mañana" : d.toFormat("cccc d 'de' LLLL");
      if (!map.has(key)) map.set(key, { label: `${label}${diff <= 1 && diff >= 0 ? ` · ${d.toFormat("cccc d 'de' LLLL")}` : ""}`, sameDay: diff <= 0, items: [] });
      map.get(key)!.items.push(a);
    }
    return [...map.entries()].sort(([x], [y]) => (x < y ? -1 : 1)).map(([, v]) => v);
  }, [appts, now, tz]);

  const next = appts.find((a) => new Date(a.endAt).getTime() > now);
  const nextMin = next ? Math.round((new Date(next.startAt).getTime() - now) / 60_000) : null;
  const clock = DateTime.fromMillis(now).setZone(tz).setLocale("es");

  return (
    <div className="space-y-6">
      <header className="overflow-hidden rounded-3xl bg-gradient-to-br from-neutral-900 via-neutral-800 to-brand p-5 text-white shadow-xl sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-white/70">{clock.toFormat("cccc d 'de' LLLL")}</p>
            <p className="text-5xl font-extrabold tabular-nums tracking-tight sm:text-6xl">{clock.toFormat("HH:mm")}</p>
          </div>
          <div className="text-right">
            {next ? (
              <>
                <p className="text-sm text-white/70">{nextMin !== null && nextMin <= 0 ? "Turno en curso" : "Próximo turno"}</p>
                <p className="text-2xl font-bold sm:text-3xl">{nextMin !== null && nextMin > 0 ? (nextMin < 60 ? `en ${nextMin} min` : `en ${Math.floor(nextMin / 60)} h ${nextMin % 60} min`) : next.customer}</p>
                <p className="text-sm text-white/70">
                  {next.customer} · {next.service}
                </p>
              </>
            ) : (
              <p className="text-lg font-semibold">Sin turnos próximos 🎉</p>
            )}
          </div>
        </div>
        <ul className="mt-4 flex flex-wrap gap-2 text-xs font-medium" aria-label="Referencias de colores">
          <li className="rounded-full bg-emerald-500 px-2.5 py-1">En curso</li>
          <li className="rounded-full bg-red-500 px-2.5 py-1">≤ 15 min</li>
          <li className="rounded-full bg-amber-400 px-2.5 py-1 text-black">≤ 1 hora</li>
          <li className="rounded-full bg-yellow-200 px-2.5 py-1 text-black">≤ 3 horas</li>
        </ul>
      </header>

      {groups.length === 0 && <p className="rounded-2xl bg-white p-8 text-center text-neutral-500 shadow-sm">No hay turnos confirmados en los próximos 7 días.</p>}

      {groups.map((g) => (
        <section key={g.label} aria-label={g.label}>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-neutral-500">{g.label}</h2>
          <ul className="space-y-3">
            {g.items.map((a) => {
              const t = tierOf(a, now, g.sameDay);
              const start = DateTime.fromISO(a.startAt).setZone(tz);
              const live = t.key === "now";
              return (
                <li key={a.id} className={`rounded-2xl border-2 p-4 shadow-sm transition-colors ${t.card}`}>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                    <div className="w-24 shrink-0">
                      <div className={`text-3xl font-extrabold tabular-nums leading-none ${t.time}`}>{start.toFormat("HH:mm")}</div>
                      {t.badge && <span className={`mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${t.pill}`}>{t.badge}</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-lg font-bold">{a.customer}</div>
                      <div className="text-sm text-neutral-700">
                        {a.service}
                        {a.barber ? ` · ${a.barber}` : ""}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                        <a className="font-medium underline" href={`https://wa.me/${a.phone.replace("+", "")}`} target="_blank" rel="noreferrer">
                          {a.phone}
                        </a>
                        {a.paid !== "NONE" && <span className={`rounded-full px-2 py-0.5 font-medium ${PAY[a.paid]}`}>{a.paidLabel}</span>}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {a.paid !== "PAID" && (
                        <SaveForm action={markAppointmentPaid} successText="Cobrado ✓">
                          <input type="hidden" name="id" value={a.id} />
                          <button className="btn-ghost !bg-white/70" title="Marcar como cobrado en el local">
                            Cobrado
                          </button>
                        </SaveForm>
                      )}
                      <SaveForm action={setAppointmentStatus} successText="Turno completado ✓">
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="status" value="COMPLETED" />
                        <button className={live ? "btn" : "btn-ghost !bg-white/70"}>Completado</button>
                      </SaveForm>
                      <SaveForm action={cancelAppointment} successText="Turno cancelado" confirm="¿Cancelar este turno? Se le avisa al cliente por WhatsApp.">
                        <input type="hidden" name="id" value={a.id} />
                        <button className="btn-ghost !bg-white/70 !text-red-600">Cancelar</button>
                      </SaveForm>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
