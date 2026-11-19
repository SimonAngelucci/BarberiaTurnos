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

/** Comparación visual: grilla fija (con hueco muerto) vs. horarios que se realinean tras una reserva de 55 min. */
export function ScheduleCompare() {
  const total = 180; // 16:00 → 19:00
  const pct = (m: number) => `${(m / total) * 100}%`;
  const Bar = ({ from, len, tone, label }: { from: number; len: number; tone: string; label: string }) => (
    <div className={`absolute inset-y-0 flex items-center justify-center overflow-hidden rounded-md px-1 text-[10px] font-semibold sm:text-xs ${tone}`} style={{ left: pct(from), width: pct(len) }}>
      <span className="truncate">{label}</span>
    </div>
  );
  return (
    <div className="space-y-6" role="img" aria-label="Ejemplo: con una reserva de 55 minutos a las 16:00, el sistema ofrece el siguiente turno a las 16:55 y no deja un hueco sin usar.">
      <div>
        <p className="mb-2 text-sm font-semibold text-neutral-500">Agenda con horarios fijos</p>
        <div className="relative h-11 rounded-lg bg-neutral-100">
          <Bar from={0} len={55} tone="bg-neutral-800 text-white" label="Reserva 55 min" />
          <Bar from={55} len={25} tone="bg-red-100 text-red-700 [background-image:repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(220,38,38,.18)_4px,rgba(220,38,38,.18)_8px)]" label="25 min perdidos" />
          <Bar from={80} len={55} tone="bg-emerald-100 text-emerald-800" label="Próximo 17:20" />
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold text-emerald-700">Con Turnos: el día se realinea</p>
        <div className="relative h-11 rounded-lg bg-neutral-100">
          <Bar from={0} len={55} tone="bg-neutral-800 text-white" label="Reserva 55 min" />
          <Bar from={55} len={55} tone="bg-emerald-200 text-emerald-900" label="Próximo 16:55" />
          <Bar from={110} len={55} tone="bg-emerald-100 text-emerald-800" label="17:50" />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-neutral-400">
          <span>16:00</span>
          <span>17:00</span>
          <span>18:00</span>
          <span>19:00</span>
        </div>
      </div>
    </div>
  );
}
