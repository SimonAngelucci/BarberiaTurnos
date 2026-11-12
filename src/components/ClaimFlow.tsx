"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DateTime } from "luxon";
import { DayPicker, makeDayItems } from "./DayPicker";
import { Modal } from "./Modal";

type Appt = {
  serviceName: string;
  barberName: string | null;
  customerFirstName: string;
  startAt: string;
  durationMin: number;
  status: string;
  paidCents: number;
};
type Lookup = { code: string; appointment: Appt; canChange: boolean; reason: string | null; deadline: string | null; notice: string };
type Stage = "enter" | "found" | "reschedule" | "rescheduled" | "cancelled";

async function post<T>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, data: j as T } : { ok: false, error: (j as { error?: string }).error ?? "Algo salió mal. Intentá de nuevo." };
  } catch {
    return { ok: false, error: "No hay conexión. Intentá de nuevo." };
  }
}

export function ClaimFlow({ slug, timezone, maxAdvanceDays, initialCode, enabled }: { slug: string; timezone: string; maxAdvanceDays: number; initialCode: string; enabled: boolean }) {
  const [stage, setStage] = useState<Stage>("enter");
  const [code, setCode] = useState(initialCode);
  const [info, setInfo] = useState<Lookup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [date, setDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [reloadTick, setReloadTick] = useState(0); // fuerza volver a pedir los horarios (ej. tras un conflicto)
  const [result, setResult] = useState<{ startAt?: string; hadPayment?: boolean } | null>(null);

  const days = useMemo(() => makeDayItems(timezone, Math.min(maxAdvanceDays, 30) + 1), [timezone, maxAdvanceDays]);
  const local = (iso: string) => DateTime.fromISO(iso).setZone(timezone).setLocale("es");

  async function lookup(c = code) {
    setBusy(true);
    setError(null);
    const r = await post<Lookup>("/api/claim/lookup", { slug, code: c });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setInfo(r.data);
    setCode(r.data.code);
    setStage("found");
  }

  // Si llegó desde el link del WhatsApp (?c=REC-XXXXXX), busca el turno directamente.
  useEffect(() => {
    if (initialCode && enabled) void lookup(initialCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Horarios disponibles del día elegido (mismo barbero y servicio)
  useEffect(() => {
    if (stage !== "reschedule" || !date) return;
    let cancelled = false;
    setSlots(null);
    setSlot(null);
    post<{ slots: string[] }>("/api/claim/availability", { slug, code, date }).then((r) => {
      if (cancelled) return;
      if (r.ok) setSlots(r.data.slots.filter((s) => s !== info?.appointment.startAt)); // el horario actual no se ofrece
      else {
        setSlots([]);
        setError(r.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [stage, date, slug, code, info, reloadTick]);

  async function reschedule() {
    if (!slot) return;
    setBusy(true);
    setError(null);
    const r = await post<{ startAt: string }>("/api/claim/reschedule", { slug, code, startAt: slot });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      setSlot(null);
      setReloadTick((n) => n + 1); // refresca los horarios por si alguien tomó el elegido
      return;
    }
    setResult({ startAt: r.data.startAt });
    setStage("rescheduled");
  }

  async function cancel() {
    setBusy(true);
    setError(null);
    const r = await post<{ hadPayment: boolean }>("/api/claim/cancel", { slug, code });
    setBusy(false);
    setConfirmCancel(false);
    if (!r.ok) return setError(r.error);
    setResult({ hadPayment: r.data.hadPayment });
    setStage("cancelled");
  }

  if (!enabled) {
    return (
      <div className="card space-y-2 text-center">
        <h2 className="text-lg font-bold">Reprogramar o cancelar</h2>
        <p className="text-sm text-neutral-600">Este negocio no permite modificar turnos por acá. Comunicate con el negocio directamente.</p>
        <Link href={`/b/${slug}`} className="btn-ghost w-full">
          Volver a la página de reservas
        </Link>
      </div>
    );
  }

  const Err = () =>
    error ? (
      <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
        {error}
      </p>
    ) : null;

  // ---------------------------------------------------------------- resultado
  if (stage === "rescheduled" && result?.startAt) {
    const d = local(result.startAt);
    return (
      <div className="card space-y-3 text-center">
        <div className="text-4xl">✅</div>
        <h2 className="text-xl font-bold">¡Turno reprogramado!</h2>
        <p className="text-neutral-600">
          {info?.appointment.serviceName} · {d.toFormat("cccc d 'de' LLLL")} a las {d.toFormat("HH:mm")}
        </p>
        <p className="text-sm text-neutral-500">Te enviamos la confirmación por WhatsApp. Tu código sigue siendo {code}.</p>
        <Link href={`/b/${slug}`} className="btn-ghost w-full">
          Volver al inicio
        </Link>
      </div>
    );
  }
  if (stage === "cancelled") {
    return (
      <div className="card space-y-3 text-center">
        <div className="text-4xl">🗑️</div>
        <h2 className="text-xl font-bold">Turno cancelado</h2>
        <p className="text-sm text-neutral-500">Liberamos el horario y te avisamos por WhatsApp.</p>
        {result?.hadPayment && <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">Tenías un pago registrado: comunicate con el negocio para coordinar la devolución.</p>}
        <Link href={`/b/${slug}`} className="btn w-full">
          Reservar un nuevo turno
        </Link>
      </div>
    );
  }

  // ---------------------------------------------------------------- ingreso del código
  if (stage === "enter" || !info) {
    return (
      <form
        className="card space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void lookup();
        }}
      >
        <div>
          <h2 className="text-lg font-bold">Reprogramar o cancelar tu turno</h2>
          <p className="text-sm text-neutral-500">Ingresá el código de reclamo que te enviamos por WhatsApp al confirmar tu turno.</p>
        </div>
        <div>
          <label className="label" htmlFor="claim">
            Código de reclamo
          </label>
          <input
            id="claim"
            className="input text-center font-mono text-lg uppercase tracking-widest"
            placeholder="REC-8F3K9A"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={14}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            required
          />
        </div>
        <Err />
        <button className="btn w-full" disabled={busy || code.trim().length < 6}>
          {busy ? "Buscando…" : "Buscar mi turno"}
        </button>
        <Link href={`/b/${slug}`} className="block text-center text-sm text-neutral-500 underline">
          Volver a la página de reservas
        </Link>
      </form>
    );
  }

  // ---------------------------------------------------------------- turno encontrado / reprogramar
  const a = info.appointment;
  const when = local(a.startAt);
  const summary = (
    <div className="space-y-1 rounded-xl bg-neutral-50 p-3 text-sm">
      <div className="font-semibold">{a.serviceName}</div>
      <div>
        {when.toFormat("cccc d 'de' LLLL")} a las <strong>{when.toFormat("HH:mm")}</strong>
      </div>
      {a.barberName && <div className="text-neutral-500">Con {a.barberName}</div>}
      <div className="font-mono text-xs text-neutral-400">{info.code}</div>
    </div>
  );

  if (stage === "found") {
    return (
      <div className="card space-y-4">
        <div>
          <h2 className="text-lg font-bold">Hola {a.customerFirstName} 👋</h2>
          <p className="text-sm text-neutral-500">Este es tu turno:</p>
        </div>
        {summary}
        {info.canChange ? (
          <>
            <p className="text-xs text-neutral-500">
              Podés modificarlo {info.notice}
              {info.deadline && <> (hasta el {local(info.deadline).toFormat("cccc d 'de' LLLL 'a las' HH:mm")})</>}.
            </p>
            <Err />
            <div className="grid gap-2 sm:grid-cols-2">
              <button className="btn" onClick={() => { setError(null); setStage("reschedule"); }}>
                📅 Reprogramar
              </button>
              <button className="btn-ghost !border-red-300 !text-red-600" onClick={() => { setError(null); setConfirmCancel(true); }}>
                Cancelar turno
              </button>
            </div>
          </>
        ) : (
          <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            {info.reason}
          </p>
        )}
        <button className="text-sm text-neutral-500 underline" onClick={() => { setInfo(null); setStage("enter"); setError(null); }}>
          Usar otro código
        </button>

        <Modal open={confirmCancel} onClose={() => !busy && setConfirmCancel(false)} title="¿Cancelar tu turno?" locked={busy}>
          <p className="text-sm">
            Vas a cancelar <strong>{a.serviceName}</strong> del {when.toFormat("cccc d 'de' LLLL")} a las {when.toFormat("HH:mm")}. Se libera el horario y no se puede deshacer.
            {a.paidCents > 0 && " Como tenés un pago registrado, vas a tener que coordinar la devolución con el negocio."}
          </p>
          <Err />
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setConfirmCancel(false)} disabled={busy}>
              Volver
            </button>
            <button onClick={cancel} disabled={busy} className="inline-flex items-center justify-center rounded-xl bg-red-600 px-4 py-2 font-medium text-white transition active:scale-[.98] disabled:opacity-50">
              {busy ? "Cancelando…" : "Sí, cancelar turno"}
            </button>
          </div>
        </Modal>
      </div>
    );
  }

  // stage === "reschedule"
  return (
    <div className="card space-y-4">
      <div>
        <h2 className="text-lg font-bold">Elegí el nuevo horario</h2>
        <p className="text-sm text-neutral-500">Tu turno actual es el {when.toFormat("cccc d 'de' LLLL")} a las {when.toFormat("HH:mm")}.</p>
      </div>

      <DayPicker days={days} value={date} onChange={setDate} />

      {date && (
        <div aria-live="polite">
          {slots === null ? (
            <div className="grid grid-cols-4 gap-2" aria-label="Buscando horarios">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="h-[38px] animate-pulse rounded-lg bg-black/10" style={{ animationDelay: `${i * 70}ms` }} />
              ))}
            </div>
          ) : slots.length === 0 ? (
            <p className="animate-rise text-sm text-neutral-500">No hay horarios disponibles ese día. Probá con otro.</p>
          ) : (
            <div key={date} className="grid grid-cols-4 gap-2">
              {slots.map((s, i) => (
                <button
                  key={s}
                  onClick={() => setSlot(s)}
                  style={{ animationDelay: `${Math.min(i, 24) * 18}ms` }}
                  className={`animate-rise rounded-lg border py-2 text-sm font-medium transition-[transform,background-color,border-color] duration-200 active:scale-95 motion-reduce:transition-none ${slot === s ? "border-brand bg-brand text-brand-fg" : "border-neutral-300 bg-white text-neutral-900 hover:-translate-y-0.5 hover:border-neutral-400"}`}
                >
                  {local(s).toFormat("HH:mm")}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <Err />
      <div className="flex gap-2">
        <button className="btn-ghost" onClick={() => { setStage("found"); setError(null); }} disabled={busy}>
          ← Volver
        </button>
        <button className="btn flex-1" disabled={!slot || busy} onClick={reschedule}>
          {busy ? "Reprogramando…" : slot ? `Confirmar ${local(slot).toFormat("ccc d LLL 'a las' HH:mm")}` : "Elegí un horario"}
        </button>
      </div>
    </div>
  );
}
