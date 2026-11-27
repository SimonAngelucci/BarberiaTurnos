import { PageHero } from "@/components/ui/PageHero";
import { Collapsible } from "@/components/ui/Collapsible";
import { Icon } from "@/components/ui/Icon";
import Link from "next/link";
import { DateTime } from "luxon";
import { prisma, getBusinessById } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { minToHHMM } from "@/lib/format";
import { groupBlocks } from "@/lib/blocks";
import { ScheduleEditor, type DayTimes } from "@/components/ScheduleEditor";
import { SaveForm } from "@/components/SaveForm";
import { BlockDayPicker } from "@/components/BlockDayPicker";
import { BlockNew } from "@/components/BlockNew";
import { BlockList, type BlockCardData } from "@/components/BlockList";
import { saveSchedule } from "../actions";

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
  const today = DateTime.now().setZone(business.timezone).toISODate()!;
  // Bloqueos próximos: lo que ya pasó queda de historial y no se muestra. Las repeticiones se juntan en una tarjeta.
  const names = new Map(timeOffs.map((t) => [t.barberId, t.barber?.name ?? null]));
  const cards: BlockCardData[] = groupBlocks(timeOffs.map((t) => ({ id: t.id, barberId: t.barberId, startAt: t.startAt, endAt: t.endAt, reason: t.reason, groupId: t.groupId }))).map((c) => ({
    id: c.id,
    groupId: c.groupId,
    barberId: c.barberId,
    barberName: names.get(c.barberId) ?? null,
    startAt: c.startAt.toISOString(),
    endAt: c.endAt.toISOString(),
    lastStart: c.lastStart.toISOString(),
    lastEnd: c.lastEnd.toISOString(),
    reason: c.reason,
    count: c.count,
    pattern: c.pattern,
  }));

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
          <ScheduleEditor
            initial={days}
            barberId={barber.id}
            tz={business.timezone}
            blocks={timeOffs.map((t) => ({ id: t.id, barberId: t.barberId, startAt: t.startAt.toISOString(), endAt: t.endAt.toISOString() }))}
          />
          <p className="text-xs text-neutral-500">Zona horaria: {business.timezone}.</p>
          <button className="btn">Guardar horarios</button>
        </SaveForm>
      )}
      <section className="card space-y-4" id="bloqueos">
        <div>
          <h2 className="font-semibold">Bloquear horarios</h2>
          <p className="text-sm text-muted">Ocultan horarios para reservar sin borrarlos de tu configuración: un horario, un rango, un día o varios (vacaciones, feriados, trámites). Los quitás cuando quieras y el horario vuelve al instante.</p>
        </div>
        {barber && (
          <BlockDayPicker
            key={barber.id}
            barberId={barber.id}
            barberName={barber.name}
            weekly={Object.fromEntries(days.map((x) => [x.wd, x.times]))}
            blocks={timeOffs.map((t) => ({ id: t.id, barberId: t.barberId, startAt: t.startAt.toISOString(), endAt: t.endAt.toISOString() }))}
            tz={business.timezone}
            today={today}
          />
        )}
        <Collapsible className="rounded-2xl border border-black/10 p-2.5" title="Nuevo bloqueo" leading={<Icon name="lock" size={16} />} headerClassName="text-sm">
          <div className="pt-1">
            <BlockNew barbers={barbers.map((b) => ({ id: b.id, name: b.name }))} tz={business.timezone} today={today} />
          </div>
        </Collapsible>
        <div>
          <h3 className="mb-2 text-sm font-semibold">Bloqueos próximos</h3>
          <BlockList
            cards={cards}
            barbers={barbers.map((b) => ({ id: b.id, name: b.name }))}
            tz={business.timezone}
            today={today}
          />
        </div>
      </section>
    </div>
  );
}
