"use client";

import { useState } from "react";
import { ActionForm } from "./ActionForm";
import { saveScheduleMode } from "@/app/admin/actions";

/** Selector de modalidad de los horarios (el intervalo se elige aparte, en la grilla de horarios). */
export function ScheduleModeForm({ mode: initialMode }: { mode: "AUTO" | "MANUAL" }) {
  const [mode, setMode] = useState(initialMode);

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
    </ActionForm>
  );
}
