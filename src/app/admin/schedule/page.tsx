import Link from "next/link";
import { DateTime } from "luxon";
import { prisma, getBusiness } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { minToHHMM, fmtDateTime } from "@/lib/format";
import { saveSchedule, addTimeOff, deleteTimeOff, addBarber } from "../actions";

const DAYS = [
  { wd: 1, label: "Lunes" },
  { wd: 2, label: "Martes" },
  { wd: 3, label: "Miércoles" },
  { wd: 4, label: "Jueves" },
  { wd: 5, label: "Viernes" },
  { wd: 6, label: "Sábado" },
  { wd: 0, label: "Domingo" },
];

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ barber?: string }> }) {
  const { businessId } = await requireAdmin();
  const business = await getBusiness();
  const sp = await searchParams;

  const barbers = await prisma.barber.findMany({ where: { businessId, active: true }, orderBy: { name: "asc" } });
  const barber = barbers.find((b) => b.id === sp.barber) ?? barbers[0];

  const [hours, timeOffs] = await Promise.all([
    barber ? prisma.workingHour.findMany({ where: { barberId: barber.id } }) : [],
    prisma.timeOff.findMany({
      where: { businessId, endAt: { gte: new Date() } },
      orderBy: { startAt: "asc" },
      include: { barber: true },
    }),
  ]);
  const byDay = new Map(hours.map((h) => [h.weekday, h]));
  const nowLocal = DateTime.now().setZone(business.timezone).toFormat("yyyy-MM-dd'T'HH:mm");

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Horarios</h1>

      <div className="flex flex-wrap items-center gap-2">
        {barbers.map((b) => (
          <Link
            key={b.id}
            href={`/admin/schedule?barber=${b.id}`}
            className={`rounded-full border px-4 py-1.5 text-sm ${b.id === barber?.id ? "border-brand bg-brand text-brand-fg" : "border-neutral-300 bg-white"}`}
          >
            {b.name}
          </Link>
        ))}
        <form action={addBarber} className="flex gap-2">
          <input name="name" placeholder="Nuevo barbero" required className="input !w-40 !py-1.5 !text-sm" />
          <button className="btn-ghost">Agregar</button>
        </form>
      </div>

      {barber && (
        <form action={saveSchedule} className="card space-y-3">
          <input type="hidden" name="barberId" value={barber.id} />
          <h2 className="font-semibold">Días y horarios de {barber.name}</h2>
          {DAYS.map(({ wd, label }) => {
            const h = byDay.get(wd);
            return (
              <div key={wd} className="flex flex-wrap items-center gap-3">
                <label className="flex w-32 items-center gap-2">
                  <input type="checkbox" name={`open_${wd}`} defaultChecked={!!h} />
                  {label}
                </label>
                <input type="time" name={`start_${wd}`} defaultValue={minToHHMM(h?.startMin ?? 540)} className="input !w-32" />
                <span>a</span>
                <input type="time" name={`end_${wd}`} defaultValue={minToHHMM(h?.endMin ?? 1140)} className="input !w-32" />
              </div>
            );
          })}
          <p className="text-xs text-neutral-500">
            Intervalo entre turnos: {business.slotIntervalMin} min (se cambia en «Negocio»). Zona horaria: {business.timezone}.
          </p>
          <button className="btn">Guardar horarios</button>
        </form>
      )}

      <section className="card space-y-3">
        <h2 className="font-semibold">Bloquear fechas (vacaciones, feriados, descansos)</h2>
        <form action={addTimeOff} className="grid gap-3 sm:grid-cols-5">
          <div className="sm:col-span-1">
            <label className="label">Aplica a</label>
            <select name="barberId" className="input">
              <option value="">Todo el negocio</option>
              {barbers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Desde</label>
            <input type="datetime-local" name="start" required defaultValue={nowLocal} className="input" />
          </div>
          <div>
            <label className="label">Hasta</label>
            <input type="datetime-local" name="end" required defaultValue={nowLocal} className="input" />
          </div>
          <div>
            <label className="label">Motivo</label>
            <input name="reason" className="input" />
          </div>
          <div className="flex items-end">
            <button className="btn w-full">Bloquear</button>
          </div>
        </form>

        <ul className="divide-y divide-neutral-100">
          {timeOffs.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span>
                {fmtDateTime(t.startAt, business.timezone)} → {fmtDateTime(t.endAt, business.timezone)} · {t.barber?.name ?? "Todo el negocio"}
                {t.reason ? ` · ${t.reason}` : ""}
              </span>
              <form action={deleteTimeOff}>
                <input type="hidden" name="id" value={t.id} />
                <button className="text-red-600 underline">Quitar</button>
              </form>
            </li>
          ))}
          {timeOffs.length === 0 && <li className="py-2 text-sm text-neutral-500">Sin bloqueos activos.</li>}
        </ul>
      </section>
    </div>
  );
}
