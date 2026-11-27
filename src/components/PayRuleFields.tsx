"use client";

import { useState } from "react";

const WEEKDAYS = [
  { n: 1, l: "Lunes" },
  { n: 2, l: "Martes" },
  { n: 3, l: "Miércoles" },
  { n: 4, l: "Jueves" },
  { n: 5, l: "Viernes" },
  { n: 6, l: "Sábado" },
  { n: 7, l: "Domingo" },
];

export type PayRuleDefaults = { percent: number; base: number; frequency: "WEEKLY" | "BIWEEKLY" | "MONTHLY"; payDay: number; rates: Record<string, number> };

/** Campos para configurar cómo se le paga a un profesional. El día de pago cambia según la frecuencia (día de la semana o del mes). */
export function PayRuleFields({ barberId, services, defaults }: { barberId: string; services: { id: string; name: string }[]; defaults: PayRuleDefaults }) {
  const [freq, setFreq] = useState(defaults.frequency);
  const monthly = freq === "MONTHLY";
  const [payDay, setPayDay] = useState(String(monthly ? defaults.payDay : defaults.payDay > 7 ? 6 : defaults.payDay));

  return (
    <div className="space-y-3">
      <input type="hidden" name="barberId" value={barberId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Porcentaje sobre lo facturado</label>
          <div className="relative">
            <input name="percent" type="number" inputMode="decimal" min={0} max={100} step="0.01" required defaultValue={defaults.percent} className="input pr-8" placeholder="50" />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">%</span>
          </div>
        </div>
        <div>
          <label className="label">Monto fijo por período (opcional)</label>
          <input name="base" type="number" inputMode="decimal" min={0} step="0.01" defaultValue={defaults.base || ""} className="input" placeholder="0" />
        </div>
        <div>
          <label className="label">Cada cuánto se paga</label>
          <select
            name="frequency"
            className="input"
            value={freq}
            onChange={(e) => {
              const f = e.target.value as typeof freq;
              setFreq(f);
              setPayDay(f === "MONTHLY" ? "30" : "6");
            }}
          >
            <option value="WEEKLY">Semanal</option>
            <option value="BIWEEKLY">Quincenal (cada 14 días)</option>
            <option value="MONTHLY">Mensual</option>
          </select>
        </div>
        <div>
          <label className="label">{monthly ? "Día del mes" : "Día de la semana"}</label>
          {monthly ? (
            <select name="payDay" className="input" value={payDay} onChange={(e) => setPayDay(e.target.value)}>
              {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  Día {n}
                </option>
              ))}
              <option value="31">Último día del mes</option>
            </select>
          ) : (
            <select name="payDay" className="input" value={payDay} onChange={(e) => setPayDay(e.target.value)}>
              {WEEKDAYS.map((d) => (
                <option key={d.n} value={d.n}>
                  {d.l}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {services.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="label">Porcentaje distinto por servicio (opcional)</legend>
          <p className="text-xs text-muted">Dejalo vacío para usar el porcentaje general.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {services.map((s) => (
              <label key={s.id} className="flex items-center justify-between gap-2 rounded-xl bg-surface-muted px-3 py-2 text-sm">
                <span className="min-w-0 truncate">{s.name}</span>
                <span className="relative w-24 shrink-0">
                  <input
                    name={`rate_${s.id}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step="0.01"
                    defaultValue={defaults.rates[s.id] !== undefined ? defaults.rates[s.id] : ""}
                    className="input !py-1.5 pr-7 text-right"
                    placeholder="—"
                    aria-label={`Porcentaje para ${s.name}`}
                  />
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted">%</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}
