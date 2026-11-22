import { PageHero } from "@/components/ui/PageHero";
import { IconButton } from "@/components/ui/IconButton";
import Link from "next/link";
import { DateTime } from "luxon";
import { prisma, getBusinessById } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { minToHHMM, fmtDateTime } from "@/lib/format";
import { ScheduleEditor, type DayTimes } from "@/components/ScheduleEditor";
import { SaveForm } from "@/components/SaveForm";
import { saveSchedule, addTimeOff, deleteTimeOff } from "../actions";

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
  const business = await getBusinessById(businessId);
  const sp = await searchParams;

  const barbers = await prisma.barber.findMany({ where: { businessId, active: true }, orderBy: { name: "asc" } });
  const barber = barbers.find((b) => b.id === sp.barber) ?? barbers[0];

  const [slots, timeOffs] = await Promise.all([
    barber ? prisma.timeSlot.findMany({ where: { barberId: barber.id }, orderBy: { startMin: "asc" }, select: { weekday: true, startMin: true } }) : [],
    prisma.timeOff.findMany({
      where: { businessId, endAt: { gte: new Date() } },
      orderBy: { startAt: "asc" },
      include: { barber: true },
    }),
  ]);
  const days: DayTimes[] = DAYS.map(({ wd, label }) => ({ wd, label, times: slots.filter((s) => s.weekday === wd).map((s) => minToHHMM(s.startMin)) }));
  const nowLocal = DateTime.now().setZone(business.timezone).toFormat("yyyy-MM-dd'T'HH:mm");

  return (
    <div className="space-y-6">
      <PageHero title="Horarios" back={{ href: "/admin/services", label: "Volver a Servicios" }} subtitle="Cargá vos los horarios que querés ofrecer, día por día. Tus clientes ven exactamente esos." />

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
        <Link href="/admin/barbers" className="btn-ghost">
          Gestionar profesionales
        </Link>
      </div>

      {barber && (
        // La clave incluye lo guardado: al guardar (o cambiar de profesional) el editor se arma de nuevo con los datos reales de la base.
        <SaveForm key={`${barber.id}-${JSON.stringify(days)}`} action={saveSchedule} className="card space-y-3" successText="Horarios guardados">
          <input type="hidden" name="barberId" value={barber.id} />
          <h2 className="font-semibold">Horarios de {barber.name}</h2>
          <ScheduleEditor initial={days} />
          <p className="text-xs text-neutral-500">Zona horaria: {business.timezone}.</p>
          <button className="btn">Guardar horarios</button>
        </SaveForm>
      )}
      <section className="card space-y-3">
        <h2 className="font-semibold">Bloquear fechas (vacaciones, feriados, descansos)</h2>
        <SaveForm action={addTimeOff} className="grid gap-3 sm:grid-cols-5" successText="Fecha bloqueada" resetOnSuccess>
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
        </SaveForm>

        <ul className="divide-y divide-neutral-100">
          {timeOffs.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span>
                {fmtDateTime(t.startAt, business.timezone)} → {fmtDateTime(t.endAt, business.timezone)} · {t.barber?.name ?? "Todo el negocio"}
                {t.reason ? ` · ${t.reason}` : ""}
              </span>
              <SaveForm action={deleteTimeOff} successText="Bloqueo quitado">
                <input type="hidden" name="id" value={t.id} />
                <IconButton type="submit" icon="trash" label="Quitar bloqueo" variant="danger" />
              </SaveForm>
            </li>
          ))}
          {timeOffs.length === 0 && <li className="py-2 text-sm text-neutral-500">Sin bloqueos activos.</li>}
        </ul>
      </section>
    </div>
  );
}
