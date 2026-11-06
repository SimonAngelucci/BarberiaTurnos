"use client";

import { useState } from "react";
import { ActionForm } from "./ActionForm";
import { saveSlotInterval } from "@/app/admin/actions";

const PRESETS = [5, 10, 15, 20, 30, 45, 60];

/**
 * Intervalo de los horarios: 5, 10, 15, 20, 30, 45, 60 minutos o el valor que quieras (5 a 240). Al guardarlo, la grilla de
 * abajo se regenera con ese intervalo y los horarios desactivados se mantienen.
 */
export function IntervalForm({ interval, mode }: { interval: number; mode: "AUTO" | "MANUAL" }) {
  const [choice, setChoice] = useState(PRESETS.includes(interval) ? String(interval) : "custom");
  const [custom, setCustom] = useState(String(interval));
  const value = choice === "custom" ? custom : choice;

  return (
    <ActionForm action={saveSlotInterval} submitLabel="Aplicar intervalo" className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="interval-choice">
            Generar horarios cada
          </label>
          <select id="interval-choice" value={choice} onChange={(e) => setChoice(e.target.value)} className="input !w-auto">
            {PRESETS.map((n) => (
              <option key={n} value={n}>
                {n} minutos
              </option>
            ))}
            <option value="custom">Personalizado…</option>
          </select>
        </div>
        {choice === "custom" && (
          <label className="flex items-center gap-2 pb-2.5 text-sm">
            <input type="number" min={5} max={240} step={1} value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Minutos del intervalo" className="input !w-24" /> minutos
          </label>
        )}
        <input type="hidden" name="slotIntervalMin" value={value} />
      </div>
      <p className="text-xs text-neutral-500">
        {mode === "MANUAL"
          ? "Los turnos empiezan cada ese intervalo desde la hora de apertura (ej: cada 20 min: 09:00, 09:20, 09:40…), y cada reserva ocupa la duración real del servicio."
          : "En modo automático los turnos siguen la duración del servicio; este intervalo define el tamaño de los bloques que activás o desactivás en la grilla."}{" "}
        Los horarios que ya tenías desactivados se mantienen. Guardá los cambios de la grilla antes de aplicarlo.
      </p>
    </ActionForm>
  );
}
