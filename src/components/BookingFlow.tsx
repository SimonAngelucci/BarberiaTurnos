"use client";

import { Icon } from "@/components/ui/Icon";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { money } from "@/lib/format";
import { DayPicker, type DayItem } from "./DayPicker";
import { payOptions, type PayChoice, type PayConfig } from "@/lib/payment-math";

import { ServiceIcon } from "./ServiceIcon";
import { FolderTabs } from "@/components/ui/FolderTabs";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { bookableDays, findNextAvailableDay } from "@/lib/booking-days";
import { clearBooked, clearDraft, isMeaningful, loadBooked, loadDraft, saveDraft, type BookedTurn, type BookingDraft } from "@/lib/booking-storage";
import type { BusinessType } from "@/lib/service-icons";

type Service = { id: string; name: string; description: string | null; priceCents: number; durationMin: number; iconKey?: string | null; iconUrl?: string | null; comingSoon?: boolean };
type Barber = { id: string; name: string; photoUrl: string | null; bio: string | null };

type Props = {
  slug: string;
  services: Service[];
  barbers: Barber[];
  timezone: string;
  currency: string;
  maxAdvanceDays: number;
  pay: PayConfig;
  /** Si la barbería permite reprogramar/cancelar con código: se muestra el código al confirmar. */
  allowChanges?: boolean;
  /** Logo de la barbería: se muestra al lado del título «Servicios». */
  logoUrl?: string | null;
  /** Rubro: elige el ícono predeterminado de los servicios que no tienen uno propio. */
  businessType?: BusinessType;
  /** El negocio aprende tiempos por cliente: se pide el WhatsApp antes de mostrar horarios para ajustar la duración. */
  learnDurations?: boolean;
  /**
   * full = todo en una pantalla (como antes). list = solo la lista de servicios: al elegir uno se pasa a la página de reserva.
   * book = la página de reserva (barbero, día y horario, datos y pago) para el servicio `initialServiceId`.
   */
  mode?: "full" | "list" | "book";
  initialServiceId?: string;
};

/** El WhatsApp arranca con el prefijo de Argentina ya cargado: el cliente solo completa el resto (puede cambiarlo si es de otro país). */
const DEFAULT_PREFIX = "+54 ";

/** Primera letra en mayúscula (el resto queda como está). */
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Avatar({ b, size }: { b: Barber; size: number }) {
  const style = { width: size, height: size };
  return b.photoUrl ? (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={b.photoUrl} alt={b.name} style={style} className="shrink-0 rounded-full bg-neutral-100 object-cover" />
  ) : (
    <div style={style} className="flex shrink-0 items-center justify-center rounded-full bg-neutral-200 font-semibold text-neutral-600">
      {b.name.slice(0, 1).toUpperCase()}
    </div>
  );
}

export function BookingFlow({ slug, services, barbers, timezone, currency, maxAdvanceDays, pay, allowChanges = false, logoUrl = null, businessType = "BARBER", learnDurations = false, mode = "full", initialServiceId }: Props) {
  const router = useRouter();
  const [claim, setClaim] = useState<string | null>(null);
  const [service, setService] = useState<Service | null>(() => (mode === "book" ? (services.find((s) => s.id === initialServiceId && !s.comingSoon) ?? null) : null));
  const [choice, setChoice] = useState<PayChoice>("NONE");
  const [barberId, setBarberId] = useState<string | null>(barbers.length === 1 ? barbers[0].id : null);
  const [date, setDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: DEFAULT_PREFIX });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [reload, setReload] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null); // tarjeta de servicio abierta en la lista
  const [pickOther, setPickOther] = useState(false); // pestaña «Elegir fecha» del selector de día

  // Progreso guardado en el navegador (ver lib/booking-storage.ts): se restaura al recargar o volver, y se borra al confirmar.
  // Lo restaurado que depende de datos del servidor (horario, forma de pago) se aplica recién cuando esos datos llegan.
  const pendingSlot = useRef<string | null>(null);
  const pendingChoice = useRef<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [resume, setResume] = useState<BookingDraft | null>(null);
  const [booked, setBooked] = useState<BookedTurn | null>(null); // turno ya reservado desde este navegador (y todavía no pasó)

  const days = useMemo(() => bookableDays(timezone, maxAdvanceDays).map((d) => d.setLocale("es")), [timezone, maxAdvanceDays]);

  const dayItems = useMemo<DayItem[]>(
    () =>
      days.map((d, i) => ({
        iso: d.toISODate()!,
        wd: d.toFormat("ccc").replace(".", ""),
        day: d.day,
        mon: d.toFormat("LLL").replace(".", ""),
        monthLabel: d.toFormat("LLLL yyyy"),
        tag: i === 0 ? "Hoy" : i === 1 ? "Mañana" : null,
        weekend: d.weekday >= 6,
        full: d.toFormat("cccc d 'de' LLLL"),
      })),
    [days],
  );

  // WhatsApp válido (solo si el negocio aprende tiempos): los horarios se calculan con el tiempo personalizado de ese cliente.
  const lookupPhone = useMemo(() => (learnDurations && parsePhoneNumberFromString(form.phone)?.isValid() ? form.phone.trim() : ""), [learnDurations, form.phone]);
  const [timing, setTiming] = useState<{ durationMin: number; adjusted: boolean } | null>(null);
  const lastCore = useRef("");

  // Al elegir barbero, la pantalla baja sola al área de días y horarios y la enfoca (para no tener que buscarla).
  const daysRef = useRef<HTMLElement>(null);
  const [focusDays, setFocusDays] = useState(0);
  useEffect(() => {
    if (focusDays === 0) return;
    const el = daysRef.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    el.focus({ preventScroll: true });
  }, [focusDays]);

  // Restaurar el borrador al entrar (solo en el navegador: en el servidor no hay localStorage).
  useEffect(() => {
    if (mode === "list") setBooked(loadBooked(slug));
    const d = loadDraft(slug);
    // «Hoy» viene elegido de entrada: sin esto la pestaña Hoy quedaba marcada pero sin día cargado (y sin horarios).
    // Si el borrador trae un día válido, lo de abajo lo reemplaza.
    if (mode !== "list" && dayItems[0]) setDate(dayItems[0].iso);
    if (d) {
      if (mode === "list") {
        // En la lista de servicios solo se ofrece retomar la reserva que quedó a medias.
        if (d.serviceId && services.some((s) => s.id === d.serviceId && !s.comingSoon) && (d.barberId || d.date || d.slot)) setResume(d);
      } else {
        // Los datos que escribió se recuperan siempre; lo elegido (profesional, día, horario) solo si es el mismo servicio.
        setForm((f) => ({ firstName: d.form.firstName || f.firstName, lastName: d.form.lastName || f.lastName, phone: d.form.phone.trim() ? d.form.phone : f.phone }));
        if (d.serviceId && d.serviceId === service?.id) {
          if (d.barberId && barbers.some((b) => b.id === d.barberId)) setBarberId(d.barberId);
          if (d.date && dayItems.some((x) => x.iso === d.date)) {
            setDate(d.date);
            pendingSlot.current = d.slot; // se restaura solo si ese horario sigue disponible
          }
          pendingChoice.current = d.payment;
        }
      }
    }
    setHydrated(true);
    // Solo al montar: el borrador se lee una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Guardar el progreso cada vez que cambia algo (sin pisarlo con un borrador vacío).
  useEffect(() => {
    if (!hydrated || mode === "list") return;
    const draft = { serviceId: service?.id ?? null, barberId, date, slot: slot ?? pendingSlot.current, payment: choice, form };
    if (isMeaningful(draft, DEFAULT_PREFIX)) saveDraft(slug, draft);
  }, [hydrated, slug, mode, service, barberId, date, slot, choice, form]);

  useEffect(() => {
    if (!service || !barberId || !date) return;
    let cancelled = false;
    // Si cambia el servicio, barbero o día se descarta el horario elegido; si solo cambia el teléfono, se conserva si sigue disponible.
    const core = `${service.id}|${barberId}|${date}|${reload}`;
    const coreChanged = core !== lastCore.current;
    lastCore.current = core;
    setSlots(null);
    if (coreChanged) setSlot(null);
    const q = `slug=${encodeURIComponent(slug)}&serviceId=${service.id}&barberId=${barberId}&date=${date}${lookupPhone ? `&phone=${encodeURIComponent(lookupPhone)}` : ""}`;
    fetch(`/api/availability?${q}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const list: string[] = j.slots ?? [];
        setSlots(list);
        const want = pendingSlot.current; // horario restaurado del borrador: vale si sigue disponible
        pendingSlot.current = null;
        setSlot((prev) => (prev && list.includes(prev) ? prev : want && list.includes(want) ? want : null));
        setTiming(j.adjusted && typeof j.durationMin === "number" ? { durationMin: j.durationMin, adjusted: true } : null);
      })
      .catch(() => !cancelled && setSlots([]));
    return () => {
      cancelled = true;
    };
  }, [slug, service, barberId, date, reload, lookupPhone]);

  // Opciones de pago para el servicio elegido (el servidor las vuelve a validar y calcula el monto real).
  const options = useMemo(() => (service ? payOptions(service.priceCents, pay) : []), [service, pay]);
  useEffect(() => {
    const want = pendingChoice.current; // forma de pago restaurada del borrador (si sigue siendo una opción válida)
    pendingChoice.current = null;
    setChoice((want && options.find((o) => o.choice === want)?.choice) || options[0]?.choice || "NONE");
  }, [options]);
  const selected = options.find((o) => o.choice === choice) ?? options[0];
  const online = !!selected && selected.choice !== "NONE";
  // Podía pagar online pero eligió abonar en el local (efectivo o físico).
  const payAtStore = !online && options.some((o) => o.choice !== "NONE");

  const phoneOk = parsePhoneNumberFromString(form.phone)?.isValid() ?? false;
  const formOk = form.firstName.trim().length >= 2 && form.lastName.trim().length >= 2 && phoneOk;

  async function submit() {
    if (!service || !barberId || !slot) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, serviceId: service.id, barberId, startAt: slot, ...form, payment: selected?.choice ?? "NONE" }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok) clearDraft(slug); // el turno ya está creado: no queda nada a medias
    if (res.ok && j.checkoutUrl) {
      window.location.href = j.checkoutUrl; // Checkout Pro de Mercado Pago; el botón queda ocupado hasta salir
      return;
    }
    setBusy(false);
    if (res.ok) {
      // Con el código del turno se lleva al cliente a su página de confirmación (fecha, hora, servicio, barbero…).
      if (typeof j.claimCode === "string") {
        setBusy(true); // el botón queda ocupado hasta que cambia la página
        window.location.assign(`/b/${slug}/confirmado?c=${encodeURIComponent(j.claimCode)}`);
        return;
      }
      setClaim(null);
      return setDone(true);
    }
    setError(j.error ?? "Error inesperado");
    if (res.status === 409) {
      setSlot(null);
      setReload((n) => n + 1); // refresca los horarios disponibles
    }
  }

  if (done && service && slot) {
    const local = DateTime.fromISO(slot).setZone(timezone).setLocale("es");
    return (
      <div className="card text-center">
        <Icon name="check-circle" size={44} className="mx-auto mb-2 text-green-600" />
        <h2 className="text-xl font-bold">¡Turno confirmado!</h2>
        <p className="mt-2 text-neutral-600">
          {service.name} · {local.toFormat("cccc d 'de' LLLL")} a las {local.toFormat("HH:mm")}
        </p>
        {payAtStore && <p className="mt-2 text-sm font-medium text-orange-700">Pago pendiente: lo abonás en el local.</p>}
        {allowChanges && claim && (
          <div className="mt-4 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-3">
            <div className="text-xs text-neutral-500">Tu código para reprogramar o cancelar</div>
            <div className="my-1 font-mono text-2xl font-bold tracking-widest">{claim}</div>
            <p className="text-xs text-neutral-500">Guardalo: también te lo enviamos por WhatsApp.</p>
            <a href={`/b/${slug}/turno?c=${encodeURIComponent(claim)}`} className="btn-ghost mt-2 w-full">
              Reprogramar o cancelar
            </a>
          </div>
        )}
        <p className="mt-2 text-sm text-neutral-500">Te enviamos la confirmación por WhatsApp y te vamos a recordar antes del turno.</p>
      </div>
    );
  }

  // «Ver próximo día disponible»: busca (de a un día) el primero con horarios y salta ahí.
  const [searching, setSearching] = useState(false);
  const [nextMsg, setNextMsg] = useState<string | null>(null);
  async function jumpToNextDay() {
    if (!service || !barberId || !date || searching) return;
    setSearching(true);
    setNextMsg(null);
    const fetchSlots = (iso: string) =>
      fetch(`/api/availability?slug=${encodeURIComponent(slug)}&serviceId=${service.id}&barberId=${barberId}&date=${iso}`)
        .then((r) => r.json())
        .then((j) => (j.slots ?? []) as string[])
        .catch(() => [] as string[]);
    const next = await findNextAvailableDay(dayItems.map((d) => d.iso), date, fetchSlots);
    setSearching(false);
    if (next) {
      setPickOther(next !== dayItems[0]?.iso && next !== dayItems[1]?.iso);
      setDate(next);
    } else setNextMsg("No encontramos horarios en los próximos días.");
  }
  useEffect(() => setNextMsg(null), [date]);

  // ---- Presentación del selector de día y horarios (la lógica de arriba no cambia)
  const dayTab = pickOther ? 2 : date && date === dayItems[0]?.iso ? 0 : date && date === dayItems[1]?.iso ? 1 : date ? 2 : 0;
  const barberName = barbers.find((x) => x.id === barberId)?.name ?? null;
  const slotLocal = slot ? DateTime.fromISO(slot).setZone(timezone).setLocale("es") : null;
  const dayBody = (
    <div aria-live="polite">
      {timing && date && (
        <p className="mt-3 rounded-2xl bg-green-50 p-2.5 text-sm text-green-900">
          <Icon name="clock" size={16} className="mr-1.5 inline -translate-y-px" />Ajustamos tu turno a <strong>{timing.durationMin} min</strong> (lo que habitualmente te lleva) en lugar de {service?.durationMin} min.
        </p>
      )}
      <div className="mt-3">
        {!date ? (
          <p className="py-2 text-sm text-muted">Elegí un día para ver los horarios disponibles.</p>
        ) : slots === null ? (
          // Esqueleto mientras se buscan los horarios
          <div className="grid grid-cols-4 gap-2" aria-label="Buscando horarios">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="h-[42px] animate-pulse rounded-full bg-surface-muted" style={{ animationDelay: `${i * 70}ms` }} />
            ))}
          </div>
        ) : slots.length === 0 ? (
          <div className="animate-rise space-y-3 rounded-2xl bg-surface-muted p-4 text-sm">
            <p className="font-semibold">{date === dayItems[0]?.iso ? "No quedan horarios para hoy" : "No hay horarios disponibles ese día"}</p>
            {nextMsg && <p className="text-muted">{nextMsg}</p>}
            <button type="button" className="btn-ghost !rounded-full" disabled={searching} onClick={jumpToNextDay}>
              {searching ? "Buscando…" : "Ver próximo día disponible"}
            </button>
          </div>
        ) : (
          <div key={date} className="grid grid-cols-4 gap-2">
            {slots.map((s, i) => (
              <button
                key={s}
                aria-pressed={slot === s}
                onClick={() => setSlot(s)}
                style={{ animationDelay: `${Math.min(i, 24) * 18}ms` }}
                className={`animate-rise rounded-full border py-2.5 text-sm font-semibold transition-[transform,background-color,border-color] duration-200 active:scale-95 motion-reduce:transition-none ${slot === s ? "border-transparent bg-primary text-on-primary shadow-sm" : "border-transparent bg-surface-muted hover:-translate-y-0.5"}`}
              >
                {DateTime.fromISO(s).setZone(timezone).toFormat("HH:mm")}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="public-flow space-y-6">
      {mode === "book" && service && (
        // Página de reserva: en lugar de la lista, el servicio elegido (con salida para cambiarlo).
        <section className="card card-ink flex items-center gap-3.5 !p-4" aria-label="Servicio elegido">
          <ServiceIcon iconKey={service.iconKey} iconUrl={service.iconUrl} type={businessType} className="!rounded-2xl !bg-ink-soft !text-primary" />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-70">Servicio elegido</div>
            <div className="font-semibold text-primary">{cap(service.name)}</div>
            <div className="text-sm opacity-80">
              {service.durationMin} min · <span className="font-semibold">{money(service.priceCents, currency)}</span>
            </div>
          </div>
          <a href={`/b/${slug}#servicios`} className="btn-ghost !rounded-full !px-3 !py-1.5 text-sm">
            Cambiar
          </a>
        </section>
      )}

      {mode !== "book" && (
      <section>
        <SectionLabel count={services.length} className="mb-3">
          Servicios
        </SectionLabel>
        {/* Turno que ya reservó desde este navegador: día y hora, con acceso a verlo o cambiarlo. */}
        {mode === "list" && booked && (() => {
          const at = DateTime.fromISO(booked.startAt).setZone(timezone).setLocale("es");
          return (
            <div className="card mb-3 flex flex-wrap items-center gap-3 !border-primary" role="status">
              <Icon name="check-circle" size={24} className="text-green-600" />
              <div className="min-w-0 flex-1 text-sm">
                <div className="font-semibold">Ya tenés tu turno</div>
                <div className="capitalize text-neutral-600">
                  {at.toFormat("cccc d 'de' LLLL")} · {at.toFormat("HH:mm")} hs
                </div>
                {booked.serviceName && <div className="text-neutral-500">{booked.serviceName}</div>}
              </div>
              {booked.claimCode && (
                <a href={`/b/${slug}/confirmado?c=${encodeURIComponent(booked.claimCode)}`} className="btn !px-4 !py-2 text-sm">
                  Ver turno
                </a>
              )}
              <button
                type="button"
                className="btn-ghost !px-3 !py-2"
                onClick={() => {
                  clearBooked(slug);
                  setBooked(null);
                }}
              >
                Ocultar
              </button>
            </div>
          );
        })()}        {/* Reserva que quedó a medias en este navegador: se puede retomar o descartar. */}
        {mode === "list" && resume && (
          <div className="card mb-3 flex flex-wrap items-center gap-3">
            <Icon name="clock" size={20} className="text-neutral-500" />
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-semibold">Tenés una reserva sin terminar</div>
              <div className="text-neutral-500">{services.find((x) => x.id === resume.serviceId)?.name}</div>
            </div>
            <button type="button" className="btn !px-4 !py-2 text-sm" onClick={() => router.push(`/b/${slug}/reservar?servicio=${encodeURIComponent(resume.serviceId!)}`)}>
              Continuar
            </button>
            <button
              type="button"
              className="btn-ghost !px-3 !py-2"
              onClick={() => {
                clearDraft(slug);
                setResume(null);
              }}
            >
              Descartar
            </button>
          </div>
        )}
        {services.length === 0 && <p className="card text-center text-sm text-neutral-500">Este negocio todavía no cargó sus servicios. Volvé a pasar en unos días.</p>}
        <div className="space-y-3">
          {services.map((s, n) => {
            const ink = n % 2 === 0;
            const open = mode === "list" ? openId === s.id : false;
            const picked = service?.id === s.id;
            return (
              <div
                key={s.id}
                className={`card !p-0 overflow-hidden transition ${ink ? "card-ink" : ""} ${s.comingSoon ? "!border-dashed opacity-60" : ""} ${picked ? "ring-2 ring-primary" : ""}`}
              >
                <button
                  type="button"
                  disabled={s.comingSoon}
                  onClick={() => {
                    if (s.comingSoon) return;
                    if (mode === "list") {
                      setOpenId(open ? null : s.id); // la tarjeta se abre; la reserva sigue en otra página con el botón de adentro
                      return;
                    }
                    setService(s);
                    setSlot(null);
                  }}
                  aria-pressed={mode === "list" ? undefined : picked}
                  aria-expanded={mode === "list" ? open : undefined}
                  className="group flex w-full items-center gap-3.5 p-4 text-left disabled:cursor-not-allowed"
                >
                  <ServiceIcon iconKey={s.iconKey} iconUrl={s.iconUrl} type={businessType} className={`!rounded-2xl ${ink ? "!bg-ink-soft !text-primary" : "!bg-surface-muted !text-inherit"}`} />
                  <div className="min-w-0 flex-1">
                    <div className={`flex flex-wrap items-center gap-2 text-lg font-semibold leading-tight ${ink ? "text-primary" : ""}`}>
                      {cap(s.name)}
                      {s.comingSoon && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800">Próximamente</span>}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
                      <span className="rounded-lg border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider" style={{ borderColor: "color-mix(in srgb, currentColor 35%, transparent)" }}>{s.durationMin} min</span>
                      <span className="font-semibold">{money(s.priceCents, currency)}</span>
                    </div>
                  </div>
                  {!s.comingSoon && (
                    <svg viewBox="0 0 24 24" className={`h-5 w-5 shrink-0 opacity-60 transition-transform duration-300 motion-reduce:transition-none ${open ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  )}
                </button>
                {mode === "list" && (
                  <div className={`grid transition-[grid-template-rows] duration-300 motion-reduce:transition-none ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                    <div className="overflow-hidden">
                      <div className="space-y-3 px-4 pb-4" inert={!open}>
                        {s.description && <p className="text-sm opacity-80">{s.description}</p>}
                        <button type="button" className={`btn w-full !rounded-full ${ink ? "" : "!bg-ink !text-primary"}`} onClick={() => router.push(`/b/${slug}/reservar?servicio=${encodeURIComponent(s.id)}`)}>
                          Reservar este servicio
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}        </div>
      </section>
      )}

      {service && barbers.length > 1 && (
        <section>
          <SectionLabel className="mb-3">Elegí profesional</SectionLabel>
          <div className="grid gap-2 sm:grid-cols-2">
            {barbers.map((b) => (
              <button
                key={b.id}
                onClick={() => {
                  setBarberId(b.id);
                  setSlot(null);
                  setFocusDays((n) => n + 1);
                }}
                className={`card flex items-start gap-3 text-left transition ${barberId === b.id ? "ring-2 ring-primary" : ""}`}
              >
                <Avatar b={b} size={56} />
                <div className="min-w-0">
                  <div className="font-medium">{b.name}</div>
                  {b.bio && <div className="line-clamp-3 text-sm text-neutral-500">{b.bio}</div>}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {service && barbers.length === 1 && (barbers[0].photoUrl || barbers[0].bio) && (
        <section className="card flex items-start gap-3">
          <Avatar b={barbers[0]} size={56} />
          <div className="min-w-0">
            <div className="font-medium">{barbers[0].name}</div>
            {barbers[0].bio && <div className="text-sm text-neutral-500">{barbers[0].bio}</div>}
          </div>
        </section>
      )}

      {service && barberId && (
        <section ref={daysRef} tabIndex={-1} className="scroll-mt-4 outline-none">
          {learnDurations && (
            <div className="card mb-4 space-y-1">
              <label className="label" htmlFor="early-phone">
                Tu WhatsApp
              </label>
              <input id="early-phone" className="input" inputMode="tel" autoComplete="tel" placeholder="+54 9 11 1234 5678" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <p className="text-xs text-muted">Si ya viniste antes, ajustamos la duración del turno a lo que a vos te lleva. Es el mismo número que te vamos a pedir al confirmar.</p>
              {form.phone.trim() !== DEFAULT_PREFIX.trim() && form.phone && !phoneOk && <p className="text-xs text-red-600">Número inválido. Empezá con + y el código de país.</p>}
            </div>
          )}
          <SectionLabel className="mb-3">Elegí el día</SectionLabel>
          <FolderTabs
            plain
            label="Día del turno"
            value={dayTab}
            onValueChange={(n) => {
              setPickOther(n === 2);
              if (n === 0) setDate(dayItems[0].iso);
              if (n === 1 && dayItems[1]) setDate(dayItems[1].iso);
            }}
            tabs={[
              { id: "hoy", label: "Hoy", content: dayBody },
              { id: "manana", label: "Mañana", content: dayBody },
              {
                id: "fecha",
                label: "Elegir fecha",
                content: (
                  <>
                    <DayPicker days={dayItems} value={date} onChange={setDate} />
                    {dayBody}
                  </>
                ),
              },
            ]}
          />
        </section>
      )}

      {slot && (
        <section className="card space-y-3">
          <SectionLabel as="h2">Tus datos</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nombre</label>
              <input className="input" autoComplete="given-name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
              {form.firstName.trim().length === 1 && <p className="mt-1 text-xs text-red-600">Mínimo 2 letras.</p>}
            </div>
            <div>
              <label className="label">Apellido</label>
              <input className="input" autoComplete="family-name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
              {form.lastName.trim().length === 1 && <p className="mt-1 text-xs text-red-600">Mínimo 2 letras.</p>}
            </div>
          </div>
          <div>
            <label className="label">WhatsApp (con código de país)</label>
            <input
              className="input"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+54 9 11 1234 5678"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            {form.phone.trim() !== DEFAULT_PREFIX.trim() && form.phone && !phoneOk && <p className="mt-1 text-xs text-red-600">Número inválido. Empezá con + y el código de país.</p>}
          </div>
          {service && options.some((o) => o.choice !== "NONE") && (
            <div className="space-y-2">
              <SectionLabel as="h3">Pago</SectionLabel>
              {options.length === 1 ? (
                <p className="rounded-2xl bg-surface-muted p-3 text-sm">
                  Para reservar tenés que pagar online {options[0].choice === "DEPOSIT" ? "una seña de" : "el total:"}{" "}
                  <strong>{money(options[0].amountCents, currency)}</strong>
                  {options[0].choice === "DEPOSIT" && <> (el resto, {money(service.priceCents - options[0].amountCents, currency)}, lo abonás en el local)</>}.
                </p>
              ) : (
                <div className="space-y-2" role="radiogroup" aria-label="Forma de pago">
                  {options.map((o) => (
                    <label
                      key={o.choice}
                      className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3 text-sm transition ${selected?.choice === o.choice ? "border-primary bg-surface-muted ring-2 ring-primary" : "border-neutral-300"}`}
                    >
                      <input type="radio" name="pay" checked={selected?.choice === o.choice} onChange={() => setChoice(o.choice)} />
                      <span className="flex-1">
                        {o.choice === "DEPOSIT" && (
                          <>
                            <strong>Pagar seña · {money(o.amountCents, currency)}</strong>
                            <span className="block text-xs text-muted">El resto ({money(service.priceCents - o.amountCents, currency)}) lo abonás en el local</span>
                          </>
                        )}
                        {o.choice === "FULL" && (
                          <>
                            <strong>Pagar el total · {money(o.amountCents, currency)}</strong>
                            <span className="block text-xs text-muted">No abonás nada en el local</span>
                          </>
                        )}
                        {o.choice === "NONE" && (
                          <>
                            <strong>Pagar en el local</strong>
                            <span className="block text-xs text-muted">Reservás ahora y abonás en efectivo o físico en el local</span>
                          </>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Resumen: sección negra con la fila principal destacada en el color de acento */}
      {slot && service && slotLocal && (
        <section aria-label="Resumen de la reserva" className="-mx-4 rounded-[2.5rem] bg-ink px-5 pb-8 pt-7 text-white">
          <SectionLabel as="h2" className="!text-primary">
            Resumen
          </SectionLabel>
          <ul className="mt-4 space-y-2.5">
            <li className="flex items-center gap-3 rounded-2xl bg-primary p-3 text-on-primary">
              <ServiceIcon iconKey={service.iconKey} iconUrl={service.iconUrl} type={businessType} size={40} className="!rounded-xl !bg-white/50 !text-inherit" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{cap(service.name)}</div>
                <div className="text-xs opacity-75">{service.durationMin} min</div>
              </div>
              <div className="text-base font-semibold tabular-nums">{money(service.priceCents, currency)}</div>
            </li>
            {[
              ["Día", <span key="d">{cap(slotLocal.toFormat("cccc d 'de' LLLL"))}</span>],
              ["Hora", <span key="h">{slotLocal.toFormat("HH:mm")} hs</span>],
              ...(barberName ? [["Profesional", <span key="p">{barberName}</span>] as const] : []),
            ].map(([label, value]) => (
              <li key={label as string} className="flex items-center justify-between gap-3 rounded-2xl border p-3 text-sm" style={{ borderColor: "var(--ink-line)", background: "var(--ink-soft)" }}>
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-70">{label}</span>
                <span className="font-semibold">{value}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {slot && <div aria-hidden className="h-28" />}

      {/* Botón principal fijo abajo (respeta el área segura de iOS) */}
      {slot && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6" style={{ background: "linear-gradient(to top, var(--bg) 55%, transparent)" }}>
          <div className="mx-auto max-w-[480px]">
            {error && (
              <p role="alert" className="pointer-events-auto mb-2 rounded-2xl bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}
            <button className="btn cta-confirm pointer-events-auto w-full !rounded-full !py-4 text-base font-semibold shadow-xl" disabled={!formOk || busy} onClick={submit}>
              {busy ? (online ? "Redirigiendo a Mercado Pago…" : "Confirmando…") : online ? `Pagar ${money(selected!.amountCents, currency)} con Mercado Pago` : payAtStore ? "Reservar y pagar en el local" : "Confirmar turno"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
