"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { SaveForm } from "./SaveForm";
import { phoneKey } from "@/lib/phone-key";
import { AgendaBoard, type AgendaBarber, type AgendaFree, type AgendaService } from "./AgendaBoard";
import { Hero } from "./ui/Hero";
import { FolderTabs } from "./ui/FolderTabs";
import { Ring } from "./ui/Ring";
import { SectionLabel } from "./ui/SectionLabel";
import { Icon } from "./ui/Icon";
import { cancelAppointment, markAppointmentPaid, setAppointmentStatus } from "@/app/admin/actions";

export type BoardAppt = {
  id: string;
  startAt: string;
  endAt: string;
  customer: string;
  phone: string;
  service: string;
  barber: string | null;
  barberId?: string | null;
  paid: "PAID" | "DEPOSIT" | "STORE" | "NONE";
  paidLabel: string;
  /** Lo que falta cobrar de este turno, en centavos (0 si ya está pago). */
  dueCents: number;
};

/** Un mes del resumen de los últimos 3 meses (el monto ya viene formateado desde el servidor). */
export type BoardMonth = { label: string; amount: string; current: boolean };

type Tier = { key: "now" | "imminent" | "soon" | "near" | "later" | "future"; badge: string; border: string; pill: string };

/** Urgencia según cuánto falta: cuanto más cerca, más fuerte el color de alerta (borde de la tarjeta y etiqueta). */
function tierOf(a: BoardAppt, nowMs: number, sameDay: boolean): Tier {
  const start = new Date(a.startAt).getTime();
  const end = new Date(a.endAt).getTime();
  const min = (start - nowMs) / 60_000;
  if (nowMs >= start && nowMs < end) return { key: "now", badge: "En curso", border: "border-emerald-400", pill: "bg-emerald-500 text-black" };
  if (min <= 15) return { key: "imminent", badge: min <= 1 ? "¡Ahora!" : `En ${Math.ceil(min)} min`, border: "border-red-500 urgent-pulse", pill: "bg-red-600 text-white" };
  if (min <= 60) return { key: "soon", badge: `En ${Math.ceil(min)} min`, border: "border-amber-400", pill: "bg-amber-400 text-black" };
  if (min <= 180) return { key: "near", badge: `En ${Math.floor(min / 60)} h ${Math.round(min % 60)} min`, border: "border-yellow-300/70", pill: "bg-yellow-300 text-black" };
  return sameDay
    ? { key: "later", badge: "Hoy", border: "border-ink-line", pill: "bg-white/15 text-white" }
    : { key: "future", badge: "", border: "border-ink-line", pill: "bg-white/10 text-white" };
}

const PAY: Record<BoardAppt["paid"], string> = {
  PAID: "bg-green-500/20 text-green-200",
  DEPOSIT: "bg-blue-500/20 text-blue-200",
  STORE: "bg-orange-500/20 text-orange-200",
  NONE: "bg-white/10 text-white/70",
};

const subtle = { borderColor: "color-mix(in srgb, currentColor 14%, transparent)" } as const;

/**
 * Pantalla de Turnos. Arriba, el bloque de color con las pestañas Confirmados | Por cobrar y el resumen; abajo, la sección negra
 * con los próximos turnos (el primero destacado, con anillo de tiempo restante). Los colores de alerta siguen la cercanía
 * (en curso, ≤15 min, ≤1 h, ≤3 h). Se actualiza sola: recalcula cada 20 s y trae datos nuevos cada minuto.
 */
export type BoardAgenda = { barbers: AgendaBarber[]; services: AgendaService[]; days: string[]; free: AgendaFree[] };

const VIEW_KEY = "turnos-view";

export function TurnosBoard({ appts, tz, months, due, footer, agenda }: { appts: BoardAppt[]; tz: string; months: BoardMonth[]; due: string; footer?: React.ReactNode; agenda?: BoardAgenda }) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [tab, setTab] = useState(0);
  const [view, setView] = useState<"lista" | "agenda">("lista"); // se recuerda la última vista elegida
  useEffect(() => {
    try {
      if (localStorage.getItem(VIEW_KEY) === "agenda") setView("agenda");
    } catch {}
  }, []);
  const pickView = (v: "lista" | "agenda") => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };
  const showAgenda = view === "agenda" && !!agenda && agenda.barbers.length > 0;

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 20_000);
    const refresh = setInterval(() => document.visibilityState === "visible" && router.refresh(), 60_000);
    return () => {
      clearInterval(tick);
      clearInterval(refresh);
    };
  }, [router]);

  const toCollect = useMemo(() => appts.filter((a) => a.paid !== "PAID"), [appts]);
  const list = tab === 0 ? appts : toCollect;

  const groups = useMemo(() => {
    const today = DateTime.fromMillis(now).setZone(tz).startOf("day");
    const map = new Map<string, { label: string; sameDay: boolean; items: BoardAppt[] }>();
    for (const a of list) {
      const d = DateTime.fromISO(a.startAt).setZone(tz).setLocale("es");
      const key = d.toISODate()!;
      const diff = Math.round(d.startOf("day").diff(today, "days").days);
      const label = diff <= 0 ? "Hoy" : diff === 1 ? "Mañana" : d.toFormat("cccc d 'de' LLLL");
      if (!map.has(key)) map.set(key, { label: `${label}${diff <= 1 && diff >= 0 ? ` · ${d.toFormat("cccc d 'de' LLLL")}` : ""}`, sameDay: diff <= 0, items: [] });
      map.get(key)!.items.push(a);
    }
    return [...map.entries()].sort(([x], [y]) => (x < y ? -1 : 1)).map(([, v]) => v);
  }, [list, now, tz]);

  const highlightId = list.find((a) => new Date(a.endAt).getTime() > now)?.id;
  // Una persona aparece una sola vez (se la reconoce por su teléfono, no por el nombre: dos personas pueden llamarse igual) y, si
  // tiene varios turnos, con la cantidad. Cada turno sigue siendo una tarjeta propia, con su id como key.
  const customers = useMemo(() => {
    const m = new Map<string, { key: string; name: string; turns: number }>();
    for (const a of appts) {
      const key = phoneKey(a.phone);
      const cur = m.get(key);
      if (cur) cur.turns++;
      else m.set(key, { key, name: a.customer, turns: 1 });
    }
    return [...m.values()].slice(0, 6);
  }, [appts]);

  const tabs = [
    {
      id: "confirmados",
      label: "Confirmados",
      count: appts.length,
      content: (
        <div className="space-y-4">
          <SectionLabel as="p">Últimos 3 meses</SectionLabel>
          <div className="flex gap-3">
            {months.map((m) => (
              <div key={m.label} className={`min-w-0 flex-1 border-l-2 pl-3 ${m.current ? "border-primary" : ""}`} style={m.current ? undefined : subtle}>
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{m.label}</div>
                <div className="mt-0.5 whitespace-nowrap text-sm font-semibold tabular-nums">{m.amount}</div>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: "por-cobrar",
      label: "Por cobrar",
      count: toCollect.length,
      content: (
        <div className="space-y-4">
          <SectionLabel as="p">Próximos 7 días</SectionLabel>
          <div className="flex gap-3">
            <div className="min-w-0 flex-1 border-l-2 border-primary pl-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Falta cobrar</div>
              <div className="mt-0.5 whitespace-nowrap text-base font-semibold tabular-nums">{due}</div>
            </div>
            <div className="min-w-0 flex-1 border-l-2 pl-3" style={subtle}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Turnos</div>
              <div className="mt-0.5 text-base font-semibold tabular-nums">{toCollect.length}</div>
            </div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div>
      <Hero>
        <h1 className="on-hero pb-4 pl-0.5">Turnos</h1>
        <FolderTabs tabs={tabs} label="Estado de los turnos" value={tab} onValueChange={setTab} />
      </Hero>

      {/* Sección negra inferior: entra desde abajo con la esquina superior curva y llega hasta el fondo de la pantalla. */}
      <section className="relative -mx-4 -mb-32 mt-2 rounded-t-[2.5rem] border-t border-ink-line bg-ink px-4 pb-44 pt-8 text-[#f4f4f4]">
        {agenda && agenda.barbers.length > 0 && (
          <div className="mb-5 inline-flex rounded-full bg-ink-soft p-1 text-sm font-semibold" role="tablist" aria-label="Vista de turnos">
            {(["lista", "agenda"] as const).map((v) => (
              <button key={v} role="tab" aria-selected={view === v} onClick={() => pickView(v)} className={`rounded-full px-4 py-1.5 transition ${view === v ? "bg-primary text-on-primary" : "text-white/70"}`}>
                {v === "lista" ? "Lista" : "Por profesional"}
              </button>
            ))}
          </div>
        )}

        {showAgenda && <AgendaBoard appts={appts} barbers={agenda!.barbers} services={agenda!.services} days={agenda!.days} free={agenda!.free} tz={tz} now={now} />}

        <div className={showAgenda ? "hidden" : ""}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <SectionLabel count={list.length} className="!text-white/60">
            {tab === 0 ? "Próximos turnos" : "Por cobrar"}
          </SectionLabel>
          <ul className="flex flex-wrap gap-1.5 text-[10px] font-semibold" aria-label="Referencias de colores">
            <li className="rounded-full bg-emerald-500 px-2 py-0.5 text-black">En curso</li>
            <li className="rounded-full bg-red-600 px-2 py-0.5">≤ 15 min</li>
            <li className="rounded-full bg-amber-400 px-2 py-0.5 text-black">≤ 1 h</li>
            <li className="rounded-full bg-yellow-300 px-2 py-0.5 text-black">≤ 3 h</li>
          </ul>
        </div>

        {groups.length === 0 && (
          <p className="rounded-3xl border border-ink-line p-8 text-center text-white/60">{tab === 0 ? "No hay turnos confirmados en los próximos 7 días." : "No hay nada por cobrar en los próximos 7 días."}</p>
        )}

        <div className="space-y-6">
          {groups.map((g) => (
            <div key={g.label} role="group" aria-label={g.label}>
              <h2 className="mb-2 pl-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">{g.label}</h2>
              <ul className="space-y-3">
                {g.items.map((a) => {
                  const t = tierOf(a, now, g.sameDay);
                  const start = DateTime.fromISO(a.startAt).setZone(tz);
                  const live = t.key === "now";
                  const hi = a.id === highlightId;
                  const min = Math.max(0, Math.round((new Date(a.startAt).getTime() - now) / 60_000));
                  return (
                    <li key={a.id} className={`rounded-3xl border p-4 transition-colors ${hi ? "bg-primary text-on-primary " : "bg-ink-soft text-white "}${hi ? `border-transparent${t.key === "imminent" ? " urgent-pulse" : ""}` : t.border}`}>
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                        <div className="w-24 shrink-0">
                          <div className="text-3xl font-light tabular-nums leading-none">{start.toFormat("HH:mm")}</div>
                          {t.badge && <span className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${t.pill}`}>{t.badge}</span>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-lg font-semibold">{a.customer}</div>
                          <div className="text-sm opacity-80">
                            {a.service}
                            {a.barber ? ` · ${a.barber}` : ""}
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                            <a className="font-medium underline" href={`https://wa.me/${a.phone.replace("+", "")}`} target="_blank" rel="noreferrer">
                              {a.phone}
                            </a>
                            {a.paid !== "NONE" && <span className={`rounded-full px-2 py-0.5 font-medium ${hi ? "bg-black/10" : PAY[a.paid]}`}>{a.paidLabel}</span>}
                          </div>
                        </div>
                        {hi && !live && (
                          <Ring value={Math.min(1, Math.max(0, 1 - min / 180))} label={min < 60 ? "Min" : "Horas"} size={44} color="var(--ink)">
                            {min < 60 ? min : Math.floor(min / 60)}
                          </Ring>
                        )}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {a.paid !== "PAID" && (
                          <SaveForm action={markAppointmentPaid} successText="Cobrado">
                            <input type="hidden" name="id" value={a.id} />
                            <button className="btn-ghost" title="Marcar como cobrado en el local">
                              Cobrado
                            </button>
                          </SaveForm>
                        )}
                        <SaveForm action={setAppointmentStatus} successText="Turno completado">
                          <input type="hidden" name="id" value={a.id} />
                          <input type="hidden" name="status" value="COMPLETED" />
                          <button className={hi ? "btn !bg-ink !text-white" : live ? "btn" : "btn-ghost"}>Completado</button>
                        </SaveForm>
                        <SaveForm action={cancelAppointment} successText="Turno cancelado" confirm="¿Cancelar este turno? Se le avisa al cliente por WhatsApp.">
                          <input type="hidden" name="id" value={a.id} />
                          <button className={`btn-ghost ${hi ? "!text-red-800" : "!text-red-400"}`}>Cancelar</button>
                        </SaveForm>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        {customers.length > 0 && (
          <div className="mt-10">
            <SectionLabel count={customers.length} className="!text-white/60">
              Clientes
            </SectionLabel>
            <ul className="mt-3 flex flex-wrap gap-2">
              {customers.map((c) => (
                <li key={c.key}>
                  <Link href="/admin/customers" className="flex items-center gap-2 rounded-2xl border border-ink-line bg-ink-soft py-1.5 pl-1.5 pr-3.5 text-sm font-semibold">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-ink text-primary">
                      <Icon name="user" size={16} />
                    </span>
                    {c.name}
                    {c.turns > 1 && <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-on-primary">{c.turns} turnos</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        </div>

        {footer && <div className="mt-8 text-neutral-900">{footer}</div>}
      </section>
    </div>
  );
}
