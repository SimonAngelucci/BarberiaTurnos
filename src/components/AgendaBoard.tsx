"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { DateTime } from "luxon";
import { buildTimeline } from "@/lib/agenda";
import { Icon } from "./ui/Icon";
import { createAdminAppointment } from "@/app/admin/actions";
import type { BoardAppt } from "./TurnosBoard";

export type AgendaBarber = { id: string; name: string; photoUrl: string | null; color: string };
export type AgendaService = { id: string; name: string; durationMin: number };
export type AgendaFree = { barberId: string; startAt: string };

const PRO_KEY = "agenda-pro";
const hhmm = (ms: number, tz: string) => DateTime.fromMillis(ms).setZone(tz).toFormat("HH:mm");

function Avatar({ b, size = 28 }: { b: AgendaBarber; size?: number }) {
  return b.photoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={b.photoUrl} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size, boxShadow: `0 0 0 2px ${b.color}` }} />
  ) : (
    <span aria-hidden className="flex shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-black" style={{ width: size, height: size, background: b.color }}>
      {b.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/**
 * Agenda del día dividida por profesional. En el celular: chips arriba (Todos + cada profesional) y los carriles se deslizan de
 * a uno con snap. En pantallas grandes: una columna por profesional, lado a lado. Cada carril lista los turnos y los huecos
 * libres (se tocan para crear un turno ahí) y, si es hoy, la línea de la hora actual.
 */
export function AgendaBoard({ appts, barbers, services, days, free, tz, now }: { appts: BoardAppt[]; barbers: AgendaBarber[]; services: AgendaService[]; days: string[]; free: AgendaFree[]; tz: string; now: number }) {
  const router = useRouter();
  const [day, setDay] = useState(days[0]);
  const [pro, setPro] = useState(0); // 0 = Todos, 1.. = profesional
  const [slot, setSlot] = useState<{ barberId: string; startAt: string } | null>(null);
  const track = useRef<HTMLDivElement>(null);
  const programmatic = useRef(false);
  const colorOf = useMemo(() => new Map(barbers.map((b) => [b.id, b])), [barbers]);
  const isToday = day === days[0];

  // Recordar el último profesional elegido.
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(PRO_KEY));
      if (Number.isInteger(saved) && saved > 0 && saved <= barbers.length) goTo(saved, false);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goTo = (i: number, smooth = true) => {
    setPro(i);
    try {
      localStorage.setItem(PRO_KEY, String(i));
    } catch {}
    const el = track.current;
    if (!el) return;
    programmatic.current = true;
    el.scrollTo({ left: i * el.clientWidth, behavior: smooth ? "smooth" : "auto" });
    setTimeout(() => (programmatic.current = false), smooth ? 450 : 50);
  };

  // El deslizamiento actualiza el chip activo (una vez por cuadro).
  const raf = useRef(0);
  const onScroll = () => {
    if (programmatic.current || raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      const el = track.current;
      if (!el || !el.clientWidth) return;
      const i = Math.round(el.scrollLeft / el.clientWidth);
      setPro((p) => {
        if (p === i) return p;
        try {
          localStorage.setItem(PRO_KEY, String(i));
        } catch {}
        return i;
      });
    });
  };

  const dayAppts = useMemo(
    () =>
      appts
        .filter((a) => DateTime.fromISO(a.startAt).setZone(tz).toISODate() === day)
        .map((a) => ({ ...a, startMs: new Date(a.startAt).getTime(), endMs: new Date(a.endAt).getTime() })),
    [appts, day, tz],
  );
  const dayFree = useMemo(() => free.filter((f) => DateTime.fromISO(f.startAt).setZone(tz).toISODate() === day).map((f) => ({ barberId: f.barberId, startMs: new Date(f.startAt).getTime() })), [free, day, tz]);

  const lane = (barberId: string | null) =>
    buildTimeline(
      barberId ? dayAppts.filter((a) => a.barberId === barberId) : dayAppts,
      barberId ? dayFree.filter((f) => f.barberId === barberId) : [],
      isToday ? now : null,
    );

  const panes: { key: string; barber: AgendaBarber | null }[] = [{ key: "todos", barber: null }, ...barbers.map((b) => ({ key: b.id, barber: b }))];

  const dayLabel = (iso: string, i: number) => {
    const d = DateTime.fromISO(iso, { zone: tz }).setLocale("es");
    return { top: i === 0 ? "Hoy" : i === 1 ? "Mañana" : d.toFormat("ccc").replace(".", ""), num: d.day };
  };

  return (
    <div>
      {/* Días */}
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Día de la agenda">
        {days.map((d, i) => {
          const l = dayLabel(d, i);
          const on = d === day;
          return (
            <button key={d} role="tab" aria-selected={on} onClick={() => setDay(d)} className={`flex shrink-0 flex-col items-center rounded-2xl px-3.5 py-2 text-xs font-semibold transition ${on ? "bg-primary text-on-primary" : "bg-ink-soft text-white/80"}`}>
              <span className="capitalize">{l.top}</span>
              <span className="text-base tabular-nums">{l.num}</span>
            </button>
          );
        })}
      </div>

      {/* Profesionales (en pantallas grandes se ven todas las columnas, así que los chips solo se usan en el celular) */}
      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 md:hidden" role="tablist" aria-label="Profesional">
        {panes.map((p, i) => (
          <button key={p.key} role="tab" aria-selected={pro === i} onClick={() => goTo(i)} className={`flex shrink-0 items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 text-sm font-semibold transition ${pro === i ? "bg-primary text-on-primary" : "bg-ink-soft text-white/80"}`}>
            {p.barber ? <Avatar b={p.barber} size={26} /> : <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-black/20" aria-hidden><Icon name="users" size={14} /></span>}
            {p.barber ? p.barber.name : "Todos"}
          </button>
        ))}
      </div>

      {/* Carriles: deslizables con snap en el celular, columnas en pantallas grandes */}
      <div
        ref={track}
        data-lanes=""
        onScroll={onScroll}
        className="no-scrollbar -mx-4 mt-4 flex snap-x snap-mandatory overflow-x-auto md:mx-0 md:grid md:snap-none md:gap-4 md:overflow-visible"
        style={{ ["--cols" as string]: Math.max(1, barbers.length) }}
      >
        <style>{`@media (min-width: 768px){ [data-lanes]{ grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); } }`}</style>
        {panes.map((p, i) => {
          const items = lane(p.barber?.id ?? null);
          return (
            <section key={p.key} aria-label={p.barber ? `Agenda de ${p.barber.name}` : "Todos los profesionales"} className={`w-full shrink-0 snap-center px-4 md:w-auto md:px-0 ${i === 0 ? "md:hidden" : ""}`}>
              {p.barber && (
                <div className="mb-3 hidden items-center gap-2 md:flex">
                  <Avatar b={p.barber} size={32} />
                  <span className="font-semibold">{p.barber.name}</span>
                </div>
              )}
              <ul className="space-y-2">
                {items.length === 0 && <li className="rounded-2xl border border-ink-line p-5 text-center text-sm text-white/55">Sin turnos ni horarios este día.</li>}
                {items.map((it, k) => {
                  if (it.kind === "now")
                    return (
                      <li key={`now-${k}`} aria-label="Hora actual" className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-red-400">
                        <span className="h-px flex-1 bg-red-500" />
                        Ahora {hhmm(it.at, tz)}
                        <span className="h-px flex-1 bg-red-500" />
                      </li>
                    );
                  if (it.kind === "free")
                    return (
                      <li key={`f-${it.barberId}-${it.at}`}>
                        <button
                          onClick={() => setSlot({ barberId: it.barberId, startAt: new Date(it.at).toISOString() })}
                          className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-white/25 px-3.5 py-2.5 text-left text-sm text-white/70 transition hover:border-primary hover:text-primary"
                        >
                          <span className="w-12 font-semibold tabular-nums">{hhmm(it.at, tz)}</span>
                          <span className="flex-1">Libre</span>
                          <Icon name="plus" size={16} />
                        </button>
                      </li>
                    );
                  const a = it.appt;
                  const b = a.barberId ? colorOf.get(a.barberId) : undefined;
                  return (
                    <li key={a.id} className="flex items-stretch gap-3 rounded-2xl border border-ink-line bg-ink-soft p-3.5" style={b ? { borderLeft: `4px solid ${b.color}` } : undefined}>
                      <div className="w-12 shrink-0">
                        <div className="text-lg font-light tabular-nums leading-none">{hhmm(a.startMs, tz)}</div>
                        <div className="mt-1 text-[10px] tabular-nums text-white/50">{hhmm(a.endMs, tz)}</div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">{a.customer}</div>
                        <div className="truncate text-xs text-white/70">{a.service}</div>
                        {a.paid !== "NONE" && <div className="mt-1 text-[11px] text-white/55">{a.paidLabel}</div>}
                      </div>
                      {b && !p.barber && (
                        <span className="flex items-center gap-1.5 self-start text-[11px] font-semibold text-white/80">
                          <Avatar b={b} size={20} />
                          {b.name}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      {slot && (
        <NewApptDialog
          slot={slot}
          barber={colorOf.get(slot.barberId)}
          services={services}
          tz={tz}
          onClose={() => setSlot(null)}
          onDone={() => {
            setSlot(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function NewApptDialog({ slot, barber, services, tz, onClose, onDone }: { slot: { barberId: string; startAt: string }; barber?: AgendaBarber; services: AgendaService[]; tz: string; onClose: () => void; onDone: () => void }) {
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [f, setF] = useState({ firstName: "", lastName: "", phone: "+54 9 " });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const when = DateTime.fromISO(slot.startAt).setZone(tz).setLocale("es");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const r = await createAdminAppointment({ barberId: slot.barberId, serviceId, startAt: slot.startAt, ...f }).catch(() => ({ ok: false as const, error: "No se pudo crear el turno." }));
    setBusy(false);
    if (r.ok) onDone();
    else setErr(r.error);
  }

  return createPortal(
    <div className="app-themed fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Nuevo turno">
      <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-black/55" onClick={onClose} />
      <form onSubmit={submit} className="relative max-h-[90vh] w-full max-w-md space-y-3 overflow-y-auto rounded-t-[2.5rem] bg-ink px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5 text-white shadow-2xl animate-rise">
        <div className="mx-auto h-1.5 w-10 rounded-full bg-white/25" aria-hidden />
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Nuevo turno</div>
          <div className="mt-1 text-lg font-semibold first-letter:uppercase">{when.toFormat("cccc d 'de' LLLL · HH:mm")} hs</div>
          {barber && <div className="text-sm text-white/70">con {barber.name}</div>}
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-white/70">Servicio</span>
          <select className="input !bg-ink-soft !text-white" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.durationMin} min
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <input className="input !bg-ink-soft !text-white" placeholder="Nombre" autoComplete="off" value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} required />
          <input className="input !bg-ink-soft !text-white" placeholder="Apellido" autoComplete="off" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} />
        </div>
        <input className="input !bg-ink-soft !text-white" inputMode="tel" placeholder="+54 9 11 1234 5678" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required />
        {err && (
          <p role="alert" className="rounded-xl bg-red-500/15 p-2.5 text-sm text-red-300">
            {err}
          </p>
        )}
        <div className="flex gap-2">
          <button type="button" className="btn-ghost flex-1 !rounded-full" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn flex-1 !rounded-full" disabled={busy || !serviceId}>
            {busy ? "Creando…" : "Crear turno"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
