"use client";

import { useState } from "react";

const QUICK = [15, 20, 30, 40, 45, 60, 75, 90];

/** Encuesta de duración: un toque en un tiempo habitual, o el número exacto. */
export function SurveyForm({ slug, token, serviceName, initial }: { slug: string; token: string; serviceName: string; initial: number | null }) {
  const [minutes, setMinutes] = useState<number | null>(initial);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function send(m: number) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/survey", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, token, minutes: m }) }).catch(() => null);
    const j = res ? ((await res.json().catch(() => ({}))) as { error?: string }) : {};
    setBusy(false);
    if (res?.ok) return setDone(true);
    setError(j.error ?? "No hay conexión. Intentá de nuevo.");
  }

  if (done) {
    return (
      <div className="card text-center">
        <div className="mb-2 text-4xl">🙏</div>
        <h2 className="text-xl font-bold">¡Gracias!</h2>
        <p className="mt-2 text-neutral-600">Con tu respuesta vamos a ajustar el tiempo de tus próximos turnos.</p>
      </div>
    );
  }

  const customN = Number(custom);
  const customOk = custom !== "" && Number.isInteger(customN) && customN >= 5 && customN <= 480;

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="text-lg font-bold">¿Cuánto tiempo te llevó?</h2>
        <p className="text-sm text-neutral-500">
          Tu <strong>{serviceName}</strong>, aproximadamente. No hace falta que sea exacto.
        </p>
      </div>
      <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Minutos">
        {QUICK.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={minutes === m && custom === ""}
            onClick={() => {
              setMinutes(m);
              setCustom("");
            }}
            className={`rounded-lg border py-2.5 text-sm font-medium transition ${minutes === m && custom === "" ? "border-brand bg-brand text-brand-fg" : "border-neutral-300 bg-white hover:border-neutral-400"}`}
          >
            {m} min
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 text-sm">
        <label htmlFor="otro">Otro:</label>
        <input id="otro" type="number" inputMode="numeric" min={5} max={480} value={custom} onChange={(e) => setCustom(e.target.value)} className="input !w-24" placeholder="ej: 50" />
        <span>minutos</span>
      </div>
      {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <button className="btn w-full" disabled={busy || (custom !== "" ? !customOk : minutes === null)} onClick={() => send(custom !== "" ? customN : minutes!)}>
        {busy ? "Enviando…" : "Enviar"}
      </button>
    </div>
  );
}
