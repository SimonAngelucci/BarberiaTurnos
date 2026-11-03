"use client";

import { useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { money } from "@/lib/format";

type Service = { id: string; name: string; description: string | null; priceCents: number; durationMin: number };
type Barber = { id: string; name: string; photoUrl: string | null; bio: string | null };

type Props = { slug: string; services: Service[]; barbers: Barber[]; timezone: string; currency: string; maxAdvanceDays: number };

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

export function BookingFlow({ slug, services, barbers, timezone, currency, maxAdvanceDays }: Props) {
  const [service, setService] = useState<Service | null>(null);
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

  useEffect(() => {
    if (!service || !barberId || !date) return;
    let cancelled = false;
    setSlots(null);
    setSlot(null);
    fetch(`/api/availability?slug=${encodeURIComponent(slug)}&serviceId=${service.id}&barberId=${barberId}&date=${date}`)
      .then((r) => r.json())
      .then((j) => !cancelled && setSlots(j.slots ?? []))
      .catch(() => !cancelled && setSlots([]));
    return () => {
      cancelled = true;
    };
  }, [slug, service, barberId, date, reload]);

  const phoneOk = parsePhoneNumberFromString(form.phone)?.isValid() ?? false;
  const formOk = form.firstName.trim().length >= 2 && form.lastName.trim().length >= 2 && phoneOk;

  async function submit() {
    if (!service || !barberId || !slot) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, serviceId: service.id, barberId, startAt: slot, ...form }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) return setDone(true);
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
        <p className="mt-2 text-sm text-neutral-500">Te enviamos la confirmación por WhatsApp y te vamos a recordar antes del turno.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 font-semibold">1. Elegí un servicio</h2>
        <div className="space-y-2">
          {services.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setService(s);
                setSlot(null);
              }}
              className={`card w-full text-left transition ${service?.id === s.id ? "!border-brand ring-2 ring-neutral-300" : ""}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">{s.name}</div>
                  {s.description && <div className="text-sm text-neutral-500">{s.description}</div>}
                  <div className="text-xs text-neutral-400">{s.durationMin} min</div>
                </div>
                <div className="font-semibold">{money(s.priceCents, currency)}</div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {service && barbers.length > 1 && (
        <section>
          <h2 className="mb-2 font-semibold">2. Elegí barbero</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {barbers.map((b) => (
              <button
                key={b.id}
                onClick={() => {
                  setBarberId(b.id);
                  setSlot(null);
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
        <section>
          <h2 className="mb-2 font-semibold">{barbers.length > 1 ? "3" : "2"}. Elegí el día</h2>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2">
            {days.map((d) => {
              const iso = d.toISODate()!;
              return (
                <button
                  key={iso}
                  onClick={() => setDate(iso)}
                  className={`flex min-w-16 flex-col items-center rounded-xl border px-3 py-2 ${date === iso ? "border-brand bg-brand text-brand-fg" : "border-neutral-300 bg-white text-neutral-900"}`}
                >
                  <span className="text-xs uppercase">{d.toFormat("ccc")}</span>
                  <span className="text-lg font-semibold">{d.day}</span>
                  <span className="text-xs">{d.toFormat("LLL")}</span>
                </button>
              );
            })}
          </div>

          {date && (
            <div className="mt-3">
              {slots === null ? (
                <p className="text-sm opacity-70">Buscando horarios…</p>
              ) : slots.length === 0 ? (
                <p className="text-sm opacity-70">No hay horarios disponibles ese día. Probá con otro.</p>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {slots.map((s) => (
                    <button
                      key={s}
                      onClick={() => setSlot(s)}
                      className={`rounded-lg border py-2 text-sm font-medium ${slot === s ? "border-brand bg-brand text-brand-fg" : "border-neutral-300 bg-white text-neutral-900"}`}
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
          {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
          <button className="btn w-full" disabled={!formOk || busy} onClick={submit}>
            {busy ? "Confirmando…" : "Confirmar turno"}
          </button>
        </section>
      )}
    </div>
  );
}
