"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { DateTime } from "luxon";
import { buildTimeline } from "@/lib/agenda";
import { blockFormValues, blockKind, blockLabel } from "@/lib/blocks";
import { Icon } from "./ui/Icon";
import { BlockForm } from "./BlockForm";
import { createAdminAppointment } from "@/app/admin/actions";
import { createSlotBlocks, removeBlock } from "@/app/admin/schedule/block-actions";
import type { BoardAppt } from "./TurnosBoard";

export type AgendaBarber = { id: string; name: string; photoUrl: string | null; color: string };
export type AgendaService = { id: string; name: string; durationMin: number };
export type AgendaFree = { barberId: string; startAt: string };
/** Bloqueo que toca los días mostrados. `series` = cuántas repeticiones próximas tiene (1 = no se repite). */
export type AgendaBlock = { id: string; barberId: string | null; startAt: string; endAt: string; reason: string | null; series: number };

const PRO_KEY = "agenda-pro";
const hhmm = (ms: number, tz: string) => DateTime.fromMillis(ms).setZone(tz).toFormat("HH:mm");
const slotKey = (barberId: string, startAt: string) => `${barberId}|${startAt}`;

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

/** Hoja que sube desde abajo (mismo estilo que el menú del panel). */
function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="app-themed fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={label}>
      <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-black/55" onClick={onClose} />
      <div className="relative max-h-[90vh] w-full max-w-md space-y-3 overflow-y-auto rounded-t-[2.5rem] bg-ink px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5 text-white shadow-2xl animate-rise">
        <div className="mx-auto h-1.5 w-10 rounded-full bg-white/25" aria-hidden />
        {children}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Agenda del día dividida por profesional. En el celular: chips arriba (Todos + cada profesional) y los carriles se deslizan de
 * a uno con snap. En pantallas grandes: una columna por profesional, lado a lado. Cada carril lista los turnos, los huecos
 * libres (se tocan para crear un turno o bloquear el horario), los horarios bloqueados (rayados, con candado) y, si es hoy, la
 * línea de la hora actual. Se puede navegar a otras semanas para bloquear con anticipación.
 */
export function AgendaBoard({
  appts,
  barbers,
  services,
  days,
  free,
  blocks,
  today,
  maxAdvanceIso,
  tz,
  now,
}: {
  appts: BoardAppt[];
  barbers: AgendaBarber[];
  services: AgendaService[];
  days: string[];
  free: AgendaFree[];
  blocks: AgendaBlock[];
  today: string;
  /** Último día que la reserva online acepta (más allá se puede bloquear pero no crear turnos). */
  maxAdvanceIso: string;
  tz: string;
  now: number;
}) {
  const router = useRouter();
  const [day, setDay] = useState(days[0]);
  const [pro, setPro] = useState(0); // 0 = Todos, 1.. = profesional
  const [slot, setSlot] = useState<{ barberId: string; startAt: string } | null>(null); // nuevo turno
  const [freeSheet, setFreeSheet] = useState<{ barberId: string; startAt: string } | null>(null);
  const [blockSheet, setBlockSheet] = useState<AgendaBlock | null>(null);
  const [editBlock, setEditBlock] = useState<AgendaBlock | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const track = useRef<HTMLDivElement>(null);
  const programmatic = useRef(false);
  const longPressed = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const colorOf = useMemo(() => new Map(barbers.map((b) => [b.id, b])), [barbers]);
  const isToday = day === today;
  const tomorrow = DateTime.fromISO(today, { zone: tz }).plus({ days: 1 }).toISODate();

  const flash = (t: string) => {
    setMsg(t);
    setTimeout(() => setMsg(null), 3500);
  };

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
  // Bloqueos que tocan este día; si empezaron antes (varios días), se muestran desde el comienzo del día.
  const dayBlocks = useMemo(() => {
    const s0 = DateTime.fromISO(day, { zone: tz }).startOf("day");
    const a = s0.toMillis();
    const b = s0.plus({ days: 1 }).toMillis();
    return blocks
      .map((x) => ({ ...x, startMs: new Date(x.startAt).getTime(), endMs: new Date(x.endAt).getTime() }))
      .filter((x) => x.startMs < b && x.endMs > a)
      .map((x) => ({ ...x, at: Math.max(x.startMs, a) }));
  }, [blocks, day, tz]);

  const lane = (barberId: string | null) =>
    buildTimeline(
      barberId ? dayAppts.filter((a) => a.barberId === barberId) : dayAppts,
      barberId ? dayFree.filter((f) => f.barberId === barberId) : [],
      isToday ? now : null,
      barberId ? dayBlocks.filter((x) => x.barberId === barberId || x.barberId === null) : dayBlocks,
    );

  const panes: { key: string; barber: AgendaBarber | null }[] = [{ key: "todos", barber: null }, ...barbers.map((b) => ({ key: b.id, barber: b }))];

  const dayLabel = (iso: string) => {
    const d = DateTime.fromISO(iso, { zone: tz }).setLocale("es");
    return { top: iso === today ? "Hoy" : iso === tomorrow ? "Mañana" : d.toFormat("ccc").replace(".", ""), num: d.day };
  };

  // ---- Navegación entre semanas
  const goWeek = (from: string) => router.push(from === today ? "/admin/turnos" : `/admin/turnos?semana=${from}`);
  const shift = (n: number) => goWeek(DateTime.fromISO(days[0], { zone: tz }).plus({ days: n }).toISODate()!);
  const range = (() => {
    const a = DateTime.fromISO(days[0], { zone: tz }).setLocale("es");
    const b = DateTime.fromISO(days[6], { zone: tz }).setLocale("es");
    return `${a.toFormat("d LLL")} – ${b.toFormat("d LLL")}`.replaceAll(".", "");
  })();
  const atStart = days[0] <= today;

  // ---- Seleccionar varios horarios
  const toggle = (barberId: string, startAt: string) =>
    setPicked((p) => {
      const n = new Set(p);
      const k = slotKey(barberId, startAt);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const stopSelecting = () => {
    setSelecting(false);
    setPicked(new Set());
  };
  const startPress = (barberId: string, startAt: string) => {
    longPressed.current = false;
    timer.current = setTimeout(() => {
      longPressed.current = true;
      setSelecting(true);
      setPicked((p) => new Set(p).add(slotKey(barberId, startAt)));
    }, 520);
  };
  const endPress = () => {
    if (timer.current) clearTimeout(timer.current);
  };
  const tapFree = (barberId: string, startAt: string) => {
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    if (selecting) toggle(barberId, startAt);
    else setFreeSheet({ barberId, startAt });
  };

  async function blockSlots(items: { barberId: string; startAt: string }[]) {
    setBusy(true);
    const r = await createSlotBlocks(items).catch(() => ({ ok: false as const, error: "No se pudo bloquear. Intentá de nuevo." }));
    setBusy(false);
    if (r.ok) {
      flash(r.created === 1 ? "Horario bloqueado" : `${r.created} horarios bloqueados`);
      stopSelecting();
      setFreeSheet(null);
      router.refresh();
    } else flash(r.error);
  }

  async function unblock(b: AgendaBlock, scope: "one" | "series") {
    setBusy(true);
    await removeBlock(b.id, scope).catch(() => {});
    setBusy(false);
    setBlockSheet(null);
    flash("Horario desbloqueado");
    router.refresh();
  }

  const beyondAdvance = (iso: string) => DateTime.fromISO(iso).setZone(tz).toISODate()! > maxAdvanceIso;

  return (
    <div>
      {/* Semana: flechas, rango y calendario para saltar a cualquier fecha futura */}
      <div className="mb-3 flex items-center gap-2" aria-label="Semana de la agenda">
        <button type="button" onClick={() => shift(-7)} disabled={atStart} aria-label="Semana anterior" className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-soft text-white/85 transition disabled:opacity-30">
          <Icon name="chevron-left" size={18} />
        </button>
        <div className="min-w-0 flex-1 text-center text-sm font-semibold tabular-nums">{range}</div>
        <button type="button" onClick={() => shift(7)} aria-label="Semana siguiente" className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-soft text-white/85 transition">
          <Icon name="chevron-right" size={18} />
        </button>
        <label className="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-ink-soft text-white/85" title="Ir a una fecha">
          <Icon name="calendar" size={17} />
          <span className="sr-only">Ir a una fecha</span>
          <input type="date" min={today} value="" onChange={(e) => e.target.value && goWeek(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Ir a una fecha" />
        </label>
        {!atStart && (
          <button type="button" onClick={() => goWeek(today)} className="rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-on-primary">
            Hoy
          </button>
        )}
      </div>

      {/* Días */}
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Día de la agenda">
        {days.map((d) => {
          const l = dayLabel(d);
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

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-xs text-white/50">{selecting ? "Tocá los horarios libres que querés bloquear." : "Tocá un horario libre para crear un turno o bloquearlo."}</p>
        <button
          type="button"
          onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
          aria-pressed={selecting}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${selecting ? "bg-primary text-on-primary" : "bg-ink-soft text-white/85"}`}
        >
          {selecting ? "Salir de selección" : "Seleccionar"}
        </button>
      </div>

      {msg && (
        <p role="status" className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold">
          {msg}
        </p>
      )}

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
                  if (it.kind === "block") {
                    const bk = it.block;
                    const s = new Date(bk.startMs);
                    const e = new Date(bk.endMs);
                    const kind = blockKind(s, e, tz);
                    const owner = bk.barberId ? colorOf.get(bk.barberId) : undefined;
                    return (
                      <li key={`b-${bk.id}`}>
                        <button
                          type="button"
                          onClick={() => setBlockSheet(bk)}
                          aria-label={`Horario bloqueado ${blockLabel(s, e, tz)}${bk.reason ? `, ${bk.reason}` : ""}. Tocá para desbloquear o editar.`}
                          className="flex w-full items-center gap-3 rounded-2xl border border-white/20 px-3.5 py-2.5 text-left text-sm text-white/75 transition hover:border-primary"
                          style={{ backgroundImage: "repeating-linear-gradient(135deg, rgba(255,255,255,0.08) 0 6px, transparent 6px 13px)" }}
                        >
                          <span className="w-12 font-semibold tabular-nums">{kind === "allday" ? "Día" : hhmm(bk.at, tz)}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold">
                              Bloqueado{kind === "range" ? ` · ${blockLabel(s, e, tz)}` : kind === "allday" ? ` · ${blockLabel(s, e, tz)}` : ""}
                            </span>
                            {(bk.reason || (!p.barber && owner) || (p.barber && bk.barberId === null)) && (
                              <span className="block truncate text-xs text-white/55">
                                {bk.reason}
                                {bk.reason && (!p.barber && owner ? " · " : p.barber && bk.barberId === null ? " · " : "")}
                                {!p.barber && owner ? owner.name : p.barber && bk.barberId === null ? "Todo el negocio" : ""}
                              </span>
                            )}
                          </span>
                          {bk.series > 1 && <Icon name="repeat" size={14} className="text-white/55" />}
                          <Icon name="lock" size={16} />
                        </button>
                      </li>
                    );
                  }
                  if (it.kind === "free") {
                    const iso = new Date(it.at).toISOString();
                    const on = picked.has(slotKey(it.barberId, iso));
                    return (
                      <li key={`f-${it.barberId}-${it.at}`}>
                        <button
                          type="button"
                          onClick={() => tapFree(it.barberId, iso)}
                          onPointerDown={() => startPress(it.barberId, iso)}
                          onPointerUp={endPress}
                          onPointerLeave={endPress}
                          onPointerCancel={endPress}
                          onContextMenu={(e) => e.preventDefault()}
                          aria-pressed={selecting ? on : undefined}
                          className={`flex w-full select-none items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left text-sm transition ${on ? "border-primary bg-primary/15 text-primary" : "border-dashed border-white/25 text-white/70 hover:border-primary hover:text-primary"}`}
                        >
                          <span className="w-12 font-semibold tabular-nums">{hhmm(it.at, tz)}</span>
                          <span className="flex-1">Libre{!p.barber && colorOf.get(it.barberId) ? ` · ${colorOf.get(it.barberId)!.name}` : ""}</span>
                          {selecting ? (
                            <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${on ? "border-primary bg-primary text-on-primary" : "border-white/40"}`} aria-hidden>
                              {on && <Icon name="check" size={12} strokeWidth={3} />}
                            </span>
                          ) : (
                            <Icon name="plus" size={16} />
                          )}
                        </button>
                      </li>
                    );
                  }
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

      {/* Barra de selección múltiple */}
      {selecting &&
        picked.size > 0 &&
        createPortal(
          <div className="app-themed fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="flex w-full max-w-md items-center gap-2 rounded-full bg-ink p-2 text-white shadow-2xl ring-1 ring-white/15">
              <button type="button" onClick={stopSelecting} className="rounded-full bg-white/10 px-4 py-2.5 text-sm font-semibold">
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  blockSlots(
                    [...picked].map((k) => {
                      const [barberId, startAt] = k.split("|");
                      return { barberId, startAt };
                    }),
                  )
                }
                className="btn flex-1 !rounded-full"
              >
                <Icon name="lock" size={15} className="mr-1.5 inline -translate-y-px" />
                {busy ? "Bloqueando…" : `Bloquear ${picked.size} ${picked.size === 1 ? "horario" : "horarios"}`}
              </button>
            </div>
          </div>,
          document.body,
        )}

      {/* Horario libre: bloquear o crear turno */}
      {freeSheet && (
        <Sheet label="Horario libre" onClose={() => setFreeSheet(null)}>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Horario libre</div>
            <div className="mt-1 text-lg font-semibold first-letter:uppercase">{DateTime.fromISO(freeSheet.startAt).setZone(tz).setLocale("es").toFormat("cccc d 'de' LLLL · HH:mm")} hs</div>
            {colorOf.get(freeSheet.barberId) && <div className="text-sm text-white/70">con {colorOf.get(freeSheet.barberId)!.name}</div>}
          </div>
          <div className="grid gap-2">
            <button type="button" disabled={busy} className="btn !rounded-full" onClick={() => blockSlots([freeSheet])}>
              <Icon name="lock" size={15} className="mr-1.5 inline -translate-y-px" />
              {busy ? "Bloqueando…" : "Bloquear"}
            </button>
            <button
              type="button"
              className="btn-ghost !rounded-full disabled:opacity-40"
              disabled={beyondAdvance(freeSheet.startAt)}
              onClick={() => {
                setSlot(freeSheet);
                setFreeSheet(null);
              }}
            >
              <Icon name="plus" size={15} className="mr-1.5 inline -translate-y-px" />
              Crear turno
            </button>
            {beyondAdvance(freeSheet.startAt) && <p className="text-xs text-white/55">Este día está más allá de lo que aceptan las reservas online, así que solo se puede bloquear.</p>}
          </div>
        </Sheet>
      )}

      {/* Horario bloqueado: desbloquear o editar */}
      {blockSheet && (
        <Sheet label="Horario bloqueado" onClose={() => setBlockSheet(null)}>
          {(() => {
            const s = new Date(blockSheet.startAt);
            const e = new Date(blockSheet.endAt);
            const kind = blockKind(s, e, tz);
            const owner = blockSheet.barberId ? colorOf.get(blockSheet.barberId)?.name : null;
            return (
              <>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                    <Icon name="lock" size={12} className="mr-1 inline -translate-y-px" />
                    Bloqueado
                  </div>
                  <div className="mt-1 text-lg font-semibold first-letter:uppercase">
                    {kind === "allday" ? blockLabel(s, e, tz) : `${DateTime.fromJSDate(s).setZone(tz).setLocale("es").toFormat("cccc d 'de' LLLL")} · ${blockLabel(s, e, tz)}`}
                  </div>
                  <div className="text-sm text-white/70">
                    {owner ?? "Todo el negocio"}
                    {blockSheet.reason ? ` · ${blockSheet.reason}` : ""}
                  </div>
                  {blockSheet.series > 1 && <div className="mt-1 text-xs text-white/55">Se repite ({blockSheet.series} veces próximas). Para cambiar toda la serie, usá Horarios → Bloqueos próximos.</div>}
                </div>
                <div className="grid gap-2">
                  <button type="button" disabled={busy} className="btn !rounded-full" onClick={() => unblock(blockSheet, "one")}>
                    {busy ? "Quitando…" : blockSheet.series > 1 ? "Desbloquear solo este" : "Desbloquear"}
                  </button>
                  {blockSheet.series > 1 && (
                    <button type="button" disabled={busy} className="btn-ghost !rounded-full" onClick={() => window.confirm("¿Quitar toda la repetición?") && unblock(blockSheet, "series")}>
                      Quitar toda la serie
                    </button>
                  )}
                  {kind !== "slot" && (
                    <button
                      type="button"
                      className="btn-ghost !rounded-full"
                      onClick={() => {
                        setEditBlock(blockSheet);
                        setBlockSheet(null);
                      }}
                    >
                      <Icon name="pencil" size={15} className="mr-1.5 inline -translate-y-px" />
                      Editar bloqueo
                    </button>
                  )}
                </div>
              </>
            );
          })()}
        </Sheet>
      )}

      {editBlock && (
        <Sheet label="Editar bloqueo" onClose={() => setEditBlock(null)}>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Editar bloqueo</div>
          <BlockForm
            tone="dark"
            barbers={barbers.map((b) => ({ id: b.id, name: b.name }))}
            tz={tz}
            today={today}
            initial={blockFormValues({ id: editBlock.id, groupId: null, barberId: editBlock.barberId, reason: editBlock.reason, startAt: new Date(editBlock.startAt), endAt: new Date(editBlock.endAt), count: 1, pattern: "single", lastStart: new Date(editBlock.startAt), lastEnd: new Date(editBlock.endAt) }, tz)}
            replace={{ id: editBlock.id, scope: "one" }}
            submitLabel="Guardar cambios"
            onCancel={() => setEditBlock(null)}
            onDone={() => {
              setEditBlock(null);
              flash("Bloqueo actualizado");
              router.refresh();
            }}
          />
        </Sheet>
      )}

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
