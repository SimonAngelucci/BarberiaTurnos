/** Ilustraciones de la landing, hechas con HTML/CSS (livianas, sin imágenes). Son ejemplos, no datos reales. */

export function PhoneMockup() {
  const services = [
    { icon: "✂️", name: "Corte", meta: "30 min · $8.000" },
    { icon: "💅", name: "Manicura", meta: "55 min · $12.000" },
    { icon: "🩺", name: "Consulta", meta: "40 min · $15.000" },
  ];
  return (
    <div className="relative mx-auto w-[260px] sm:w-[290px]" aria-hidden>
      <div className="absolute -inset-6 -z-10 rounded-[3rem] bg-gradient-to-tr from-emerald-300/40 via-sky-300/30 to-violet-300/40 blur-2xl" />
      <div className="overflow-hidden rounded-[2.4rem] border-[7px] border-neutral-900 bg-white shadow-2xl">
        <div className="h-5 bg-neutral-900" />
        <div className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-900 text-sm text-white">L</span>
            <div>
              <div className="text-sm font-bold leading-tight">Tu negocio</div>
              <div className="text-[11px] text-neutral-500">Reservá tu turno online</div>
            </div>
          </div>
          <div className="space-y-2">
            {services.map((s, i) => (
              <div key={s.name} className={`flex items-center gap-2.5 rounded-xl border p-2.5 ${i === 1 ? "border-neutral-900 ring-2 ring-neutral-900/10" : "border-neutral-200"}`}>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-base">{s.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold leading-tight">{s.name}</div>
                  <div className="text-[11px] text-neutral-500">{s.meta}</div>
                </div>
                <span className="text-neutral-300">›</span>
              </div>
            ))}
          </div>
          <div>
            <div className="mb-1.5 text-xs font-semibold">Elegí el horario</div>
            <div className="grid grid-cols-4 gap-1.5 text-center text-[11px] font-medium">
              {["09:00", "09:55", "10:50", "11:45", "12:40", "13:35", "14:30", "15:25"].map((h, i) => (
                <span key={h} className={`rounded-md border py-1.5 ${i === 2 ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200"}`}>
                  {h}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-xl bg-neutral-900 py-2.5 text-center text-sm font-semibold text-white">Confirmar turno</div>
        </div>
      </div>
    </div>
  );
}

/** Ejemplo de un día con horarios cargados a mano (cualquier hora, sin intervalos fijos); uno ya reservado. */
export function ScheduleChips() {
  const times = ["07:30", "09:00", "09:40", "10:15", "11:50", "13:05", "15:00", "16:10", "17:25", "18:45", "19:20", "20:00"];
  const taken = new Set(["09:40", "16:10"]);
  return (
    <div className="space-y-4" role="img" aria-label="Ejemplo de un día con horarios cargados a mano, como 07:30, 09:00 o 19:20; los reservados dejan de estar disponibles.">
      <div className="flex items-center justify-between">
        <p className="font-bold">Viernes</p>
        <p className="text-xs text-neutral-500">12 horarios cargados</p>
      </div>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {times.map((t) => (
          <li
            key={t}
            className={`rounded-lg border py-2 text-center text-sm font-semibold tabular-nums ${taken.has(t) ? "border-neutral-200 bg-neutral-100 text-neutral-400 line-through" : "border-emerald-300 bg-emerald-50 text-emerald-900"}`}
          >
            {t}
          </li>
        ))}
      </ul>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-300" /> Disponible para reservar
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-sm bg-neutral-300" /> Ya reservado
        </span>
      </p>
    </div>
  );
}