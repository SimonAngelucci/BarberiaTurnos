"use client";

import { useActionState, useState } from "react";
import { money } from "@/lib/format";
import { payOptions, type PayMode } from "@/lib/payment-math";
import { savePaymentSettings } from "@/app/admin/actions";

type Props = {
  currency: string;
  enabled: boolean;
  mode: PayMode;
  depositType: "PERCENT" | "FIXED";
  /** PERCENT: 1–100. FIXED: centavos. */
  depositValue: number;
  allowPayLater: boolean;
  paymentTemplate: string;
  connectedLabel: string | null;
};

const MODES: { value: PayMode; title: string; hint: string }[] = [
  { value: "DEPOSIT_ONLY", title: "Solo seña", hint: "El cliente paga una parte online y el resto en el local." },
  { value: "FULL_ONLY", title: "Solo pago completo", hint: "El cliente paga el total online." },
  { value: "BOTH", title: "Ambas", hint: "El cliente elige entre seña o total." },
];

export function PaymentsForm(p: Props) {
  const [state, action, pending] = useActionState(savePaymentSettings, null);
  const [enabled, setEnabled] = useState(p.enabled);
  const [mode, setMode] = useState<PayMode>(p.mode);
  const [type, setType] = useState(p.depositType);
  // En el formulario el monto fijo se escribe en pesos; en la base va en centavos.
  const [value, setValue] = useState(String(p.depositType === "FIXED" ? p.depositValue / 100 : p.depositValue));
  const [later, setLater] = useState(p.allowPayLater);

  // Vista previa con un servicio de ejemplo de $10.000
  const sample = 1_000_000;
  const preview = payOptions(sample, {
    enabled: true,
    mode,
    depositType: type,
    depositValue: type === "FIXED" ? Math.round(Number(value) * 100) || 0 : Number(value) || 0,
    allowPayLater: later,
  });

  return (
    <form action={action} className="space-y-4">
      <section className="card space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Mercado Pago</h2>
            <p className="text-sm text-neutral-500">
              {p.connectedLabel ? (
                <>
                  Cuenta conectada: <strong>{p.connectedLabel}</strong>
                </>
              ) : (
                "Todavía no conectaste tu cuenta."
              )}
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="enabled" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Cobrar online
          </label>
        </div>

        <div>
          <label className="label">Access Token {p.connectedLabel && "(dejalo vacío para mantener el actual)"}</label>
          <input
            name="accessToken"
            type="password"
            autoComplete="off"
            className="input font-mono text-sm"
            placeholder="APP_USR-…"
          />
          <p className="mt-1 text-xs text-neutral-500">
            Lo encontrás en Mercado Pago → <em>Tus integraciones</em> → tu aplicación (Checkout Pro) → <em>Credenciales de producción</em>. Se guarda cifrado y nunca se muestra de nuevo.
          </p>
        </div>
        {p.connectedLabel && (
          <label className="flex items-center gap-2 text-sm text-neutral-500">
            <input type="checkbox" name="removeToken" /> Desconectar mi cuenta (se desactivan los pagos)
          </label>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">¿Qué puede pagar el cliente?</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          {MODES.map((m) => (
            <label
              key={m.value}
              className={`cursor-pointer rounded-xl border p-3 text-sm ${mode === m.value ? "border-brand ring-2 ring-neutral-300" : "border-neutral-300"}`}
            >
              <input type="radio" name="mode" value={m.value} checked={mode === m.value} onChange={() => setMode(m.value)} className="mr-2" />
              <strong>{m.title}</strong>
              <span className="mt-1 block text-xs text-neutral-500">{m.hint}</span>
            </label>
          ))}
        </div>

        <div className={`grid gap-3 sm:grid-cols-2 ${mode === "FULL_ONLY" ? "opacity-50" : ""}`}>
          <div>
            <label className="label">Tipo de seña</label>
            <select
              name="depositType"
              className="input"
              value={type}
              onChange={(e) => {
                const t = e.target.value as "PERCENT" | "FIXED";
                setType(t);
                setValue(t === "PERCENT" ? "30" : "5000");
              }}
            >
              <option value="PERCENT">Porcentaje del servicio</option>
              <option value="FIXED">Monto fijo</option>
            </select>
          </div>
          <div>
            <label className="label">{type === "PERCENT" ? "Porcentaje (1–100)" : `Monto (${p.currency})`}</label>
            <input
              name="depositValue"
              type="number"
              min={1}
              max={type === "PERCENT" ? 100 : undefined}
              step={type === "PERCENT" ? 1 : "any"}
              required
              className="input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="allowPayLater" checked={later} onChange={(e) => setLater(e.target.checked)} className="mt-0.5" />
          <span>
            Permitir <strong>«Pagar en el local»</strong> (efectivo o físico)
            <span className="block text-xs text-neutral-500">
              El cliente reserva sin pagar online y el turno queda como «Pago pendiente en el local». Si lo desactivás, el pago online es obligatorio.
            </span>
          </span>
        </label>

        <div className="rounded-xl bg-neutral-50 p-3 text-sm">
          <div className="mb-1 text-xs font-medium text-neutral-500">Así lo verá el cliente (servicio de ejemplo de {money(sample, p.currency)})</div>
          <ul className="space-y-0.5">
            {preview.map((o) => (
              <li key={o.choice}>
                {o.choice === "DEPOSIT" && <>Pagar seña: <strong>{money(o.amountCents, p.currency)}</strong></>}
                {o.choice === "FULL" && <>Pagar el total: <strong>{money(o.amountCents, p.currency)}</strong></>}
                {o.choice === "NONE" && <>Pagar en el local (efectivo o físico)</>}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold">Mensaje de WhatsApp al recibir un pago</h2>
        <p className="text-xs text-neutral-500">Variables: {"{{nombre}} {{servicio}} {{fecha}} {{hora}} {{negocio}} {{monto}}"}</p>
        <textarea name="paymentTemplate" rows={3} className="input" defaultValue={p.paymentTemplate} />
      </section>

      {state?.error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}
      {state?.ok && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{state.message}</p>}
      <button className="btn" disabled={pending}>
        {pending ? "Verificando y guardando…" : "Guardar configuración de pagos"}
      </button>
    </form>
  );
}
