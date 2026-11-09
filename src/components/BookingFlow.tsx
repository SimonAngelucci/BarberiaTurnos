"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DateTime } from "luxon";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { money } from "@/lib/format";
import { DayPicker, type DayItem } from "./DayPicker";
import { payOptions, type PayChoice, type PayConfig } from "@/lib/payment-math";

import { ServiceIcon } from "./ServiceIcon";
import type { BusinessType } from "@/lib/service-icons";

type Service = { id: string; name: string; description: string | null; priceCents: number; durationMin: number; iconKey?: string | null; iconUrl?: string | null };
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
};

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

export function BookingFlow({ slug, services, barbers, timezone, currency, maxAdvanceDays, pay, allowChanges = false, logoUrl = null, businessType = "BARBER", learnDurations = false }: Props) {
  const [claim, setClaim] = useState<string | null>(null);
  const [service, setService] = useState<Service | null>(null);
  const [choice, setChoice] = useState<PayChoice>("NONE");
  const [barberId, setBarberId] = useState<string | null>(barbers.length === 1 ? barbers[0].id : null);
  const [date, setDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [reload, setReload] = useState(0);

  const days = useMemo(() => {
    const today = DateTime.now().setZone(timezone).startOf("day");
    return Array.from({ length: Math.min(maxAdvanceDays, 30) + 1 }, (_, i) => today.plus({ days: i }).setLocale("es"));
  }, [timezone, maxAdvanceDays]);

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
        setSlot((prev) => (prev && list.includes(prev) ? prev : null));
        setTiming(j.adjusted && typeof j.durationMin === "number" ? { durationMin: j.durationMin, adjusted: true } : null);
      })
      .catch(() => !cancelled && setSlots([]));
    return () => {
      cancelled = true;
    };
  }, [slug, service, barberId, date, reload, lookupPhone]);

  // Opciones de pago para el servicio elegido (el servidor las vuelve a validar y calcula el monto real).
  const options = useMemo(() => (service ? payOptions(service.priceCents, pay) : []), [service, pay]);
  useEffect(() => setChoice(options[0]?.choice ?? "NONE"), [options]);
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
        <div className="mb-2 text-4xl">✅</div>
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

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-3 flex items-center gap-3">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-9 w-9 shrink-0 rounded-full bg-white object-cover shadow-sm" />
          )}
          <h2 className="text-xl font-bold tracking-tight">Servicios</h2>
        </div>
        <div className="space-y-2.5">
          {services.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setService(s);
                setSlot(null);
              }}
              aria-pressed={service?.id === s.id}
              className={`card group w-full !p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${service?.id === s.id ? "!border-brand ring-2 ring-brand/30" : ""}`}
            >
              <div className="flex items-center gap-3.5">
                <ServiceIcon iconKey={s.iconKey} iconUrl={s.iconUrl} type={businessType} className="transition group-hover:bg-brand group-hover:text-brand-fg" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{s.name}</div>
                  {s.description && <div className="line-clamp-2 text-sm text-neutral-500">{s.description}</div>}
                  <div className="mt-0.5 text-sm text-neutral-500">
                    {s.durationMin} min · <span className="font-semibold text-neutral-900">{money(s.priceCents, currency)}</span>
                  </div>
                </div>
                <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-neutral-400 transition group-hover:translate-x-0.5 group-hover:text-neutral-700" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      </section>

      {service && barbers.length > 1 && (
        <section>
          <h2 className="mb-2 text-lg font-bold tracking-tight">Elegí barbero</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {barbers.map((b) => (
              <button
                key={b.id}
                onClick={() => {
                  setBarberId(b.id);
                  setSlot(null);
                  setFocusDays((n) => n + 1);
                }}
                className={`card flex items-start gap-3 text-left transition ${barberId === b.id ? "!border-brand ring-2 ring-neutral-300" : ""}`}
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
              <p className="text-xs text-neutral-500">Si ya viniste antes, ajustamos la duración del turno a lo que a vos te lleva. Es el mismo número que te vamos a pedir al confirmar.</p>
              {form.phone && !phoneOk && <p className="text-xs text-red-600">Número inválido. Empezá con + y el código de país.</p>}
            </div>
          )}
          <h2 className="mb-2 text-lg font-bold tracking-tight">Elegí el día</h2>
          <DayPicker days={dayItems} value={date} onChange={setDate} />
          {timing && date && (
            <p className="mt-3 rounded-xl bg-green-50 p-2.5 text-sm text-green-900">
              ⏱️ Ajustamos tu turno a <strong>{timing.durationMin} min</strong> (lo que habitualmente te lleva) en lugar de {service.durationMin} min.
            </p>
          )}

          {date && (
            <div className="mt-3" aria-live="polite">
              {slots === null ? (
                // Esqueleto mientras se buscan los horarios
                <div className="grid grid-cols-4 gap-2" aria-label="Buscando horarios">
                  {Array.from({ length: 8 }, (_, i) => (
                    <div key={i} className="h-[38px] animate-pulse rounded-lg bg-black/10" style={{ animationDelay: `${i * 70}ms` }} />
                  ))}
                </div>
              ) : slots.length === 0 ? (
                <p className="animate-rise text-sm opacity-70">No hay horarios disponibles ese día. Probá con otro.</p>
              ) : (
                <div key={date} className="grid grid-cols-4 gap-2">
                  {slots.map((s, i) => (
                    <button
                      key={s}
                      onClick={() => setSlot(s)}
                      style={{ animationDelay: `${Math.min(i, 24) * 18}ms` }}
                      className={`animate-rise rounded-lg border py-2 text-sm font-medium transition-[transform,background-color,border-color] duration-200 active:scale-95 motion-reduce:transition-none ${slot === s ? "border-brand bg-brand text-brand-fg" : "border-neutral-300 bg-white text-neutral-900 hover:-translate-y-0.5 hover:border-neutral-400"}`}
                    >
                      {DateTime.fromISO(s).setZone(timezone).toFormat("HH:mm")}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {slot && (
        <section className="card space-y-3">
          <h2 className="font-semibold">Tus datos</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nombre</label>
              <input className="input" autoComplete="given-name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div>
              <label className="label">Apellido</label>
              <input className="input" autoComplete="family-name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
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
            {form.phone && !phoneOk && <p className="mt-1 text-xs text-red-600">Número inválido. Empezá con + y el código de país.</p>}
          </div>
          {service && options.some((o) => o.choice !== "NONE") && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Pago</h3>
              {options.length === 1 ? (
                <p className="rounded-xl bg-neutral-50 p-3 text-sm">
                  Para reservar tenés que pagar online {options[0].choice === "DEPOSIT" ? "una seña de" : "el total:"}{" "}
                  <strong>{money(options[0].amountCents, currency)}</strong>
                  {options[0].choice === "DEPOSIT" && <> (el resto, {money(service.priceCents - options[0].amountCents, currency)}, lo abonás en el local)</>}.
                </p>
              ) : (
                <div className="space-y-2" role="radiogroup" aria-label="Forma de pago">
                  {options.map((o) => (
                    <label
                      key={o.choice}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm ${selected?.choice === o.choice ? "border-brand ring-2 ring-neutral-300" : "border-neutral-300"}`}
                    >
                      <input type="radio" name="pay" checked={selected?.choice === o.choice} onChange={() => setChoice(o.choice)} />
                      <span className="flex-1">
                        {o.choice === "DEPOSIT" && (
                          <>
                            <strong>Pagar seña · {money(o.amountCents, currency)}</strong>
                            <span className="block text-xs text-neutral-500">El resto ({money(service.priceCents - o.amountCents, currency)}) lo abonás en el local</span>
                          </>
                        )}
                        {o.choice === "FULL" && (
                          <>
                            <strong>Pagar el total · {money(o.amountCents, currency)}</strong>
                            <span className="block text-xs text-neutral-500">No abonás nada en el local</span>
                          </>
                        )}
                        {o.choice === "NONE" && (
                          <>
                            <strong>Pagar en el local</strong>
                            <span className="block text-xs text-neutral-500">Reservás ahora y abonás en efectivo o físico en el local</span>
                          </>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
          {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
          <button className="btn w-full" disabled={!formOk || busy} onClick={submit}>
            {busy ? (online ? "Redirigiendo a Mercado Pago…" : "Confirmando…") : online ? `Pagar ${money(selected!.amountCents, currency)} con Mercado Pago` : payAtStore ? "Reservar y pagar en el local" : "Confirmar turno"}
          </button>
        </section>
      )}
    </div>
  );
}
