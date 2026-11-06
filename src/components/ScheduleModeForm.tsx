"use client";

import { useState } from "react";
import { ActionForm } from "./ActionForm";
import { saveScheduleMode } from "@/app/admin/actions";

const PRESETS = [15, 20, 30, 45, 60];

/**
 * Selector de modalidad de los horarios. Muestra solo las opciones de la modalidad elegida: en manual, el intervalo
 * (15, 20, 30, 45, 60 o personalizado); en automático no hay nada más que configurar.
 */
export function ScheduleModeForm({ mode: initialMode, interval }: { mode: "AUTO" | "MANUAL"; interval: number }) {
  const [mode, setMode] = useState(initialMode);
  const [choice, setChoice] = useState(PRESETS.includes(interval) ? String(interval) : "custom");
  const [custom, setCustom] = useState(String(interval));
  const value = choice === "custom" ? custom : choice;

  const card = (m: "AUTO" | "MANUAL", title: string, text: string) => (
    <label key={m} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${mode === m ? "border-brand ring-2 ring-brand/20" : "border-neutral-300 hover:border-neutral-400"}`}>
      <input type="radio" name="scheduleMode" value={m} checked={mode === m} onChange={() => setMode(m)} className="mt-1" />
      <span className="text-sm">
        <span className="flex items-center gap-2 font-semibold">
          {title}
          {initialMode === m && <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800">Activo</span>}
        </span>
        <span className="block text-neutral-500">{text}</span>
      </span>
    </label>
  );

  return (
    <ActionForm action={saveScheduleMode} submitLabel="Guardar modalidad">
      <div className="grid gap-2 sm:grid-cols-2">
        {card("AUTO", "Automático", "Los horarios se calculan según la duración del servicio que elige el cliente (45 min: 09:00, 09:45, 10:30…).")}
        {card("MANUAL", "Manual", "Los turnos empiezan cada cierto intervalo fijo, sin importar la duración del servicio (ej: 09:00, 09:30, 10:00…).")}
      </div>

      {mode === "MANUAL" && (
        <div className="space-y-2 rounded-xl bg-neutral-50 p-3">
          <label className="label" htmlFor="interval-choice">
            Intervalo entre horarios de inicio
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <select id="interval-choice" value={choice} onChange={(e) => setChoice(e.target.value)} className="input !w-auto">
              {PRESETS.map((n) => (
                <option key={n} value={n}>
                  {n} minutos
                </option>
              ))}
              <option value="custom">Personalizado…</option>
            </select>
            {choice === "custom" && (
              <label className="flex items-center gap-2 text-sm">
                <input type="number" min={5} max={240} step={5} value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Minutos del intervalo" className="input !w-24" /> minutos
              </label>
            )}
            <input type="hidden" name="slotIntervalMin" value={value} />
          </div>
          <p className="text-xs text-neutral-500">Cada reserva ocupa igual la duración real del servicio (un servicio de 45 min a las 09:00 ocupa hasta las 09:45).</p>
        </div>
      )}
      {mode === "AUTO" && (
        <p className="rounded-xl bg-neutral-50 p-3 text-xs text-neutral-500">
          No hay nada más que configurar: cada servicio ocupa exactamente su duración (se define en «Servicios»). Si después volvés al modo manual, se conserva tu intervalo de {interval} minutos.
        </p>
      )}
    </ActionForm>
  );
}
