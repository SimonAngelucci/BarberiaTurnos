import { PageHero } from "@/components/ui/PageHero";
import { Icon } from "@/components/ui/Icon";
import { Collapsible } from "@/components/ui/Collapsible";
import { DateTime } from "luxon";
import { prisma } from "@/lib/db";
import { phoneKey } from "@/lib/phone-key";
import { requireAdmin } from "@/lib/auth";
import { prettyPhone } from "@/lib/profile";
import { SaveForm } from "@/components/SaveForm";
import { learnedMinutes, MIN_SAMPLES, WINDOW } from "@/lib/learned-duration";
import { clearCustomerTime, resetCustomerTime, saveLearnDurations, setCustomerTime } from "./actions";

export const dynamic = "force-dynamic";

const SOURCE = { standard: "Duración normal", learned: "Aprendido", override: "Fijado por vos" } as const;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { businessId } = await requireAdmin();
  const q = ((await searchParams).q ?? "").trim().slice(0, 60);

  const [business, services, customers] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId }, select: { learnDurations: true, timezone: true } }),
    prisma.service.findMany({ where: { businessId, active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, durationMin: true } }),
    prisma.customer.findMany({
      where: {
        businessId,
        ...(q ? { OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { phone: { contains: q.replace(/[^\d+]/g, "") || "§" } }] } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 40,
      include: {
        times: true,
        appointments: { orderBy: { startAt: "desc" }, select: { id: true, serviceId: true, actualDurationMin: true, startAt: true, status: true, service: { select: { name: true } }, barber: { select: { name: true } } } },
      },
    }),
  ]);
  const learn = business?.learnDurations ?? false;
  const tz = business?.timezone ?? "America/Argentina/Buenos_Aires";

  // Una persona aparece una sola vez: se la reconoce por su teléfono normalizado (con o sin el 9 de Argentina), no por el nombre.
  // Si hay registros duplicados de la misma persona se muestran juntos; los ajustes de tiempo se guardan en el registro principal.
  const groups = new Map<string, typeof customers>();
  for (const c of customers) {
    const k = phoneKey(c.phone);
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  const people = [...groups.values()].map((g) => {
    const sorted = [...g].sort((a, b) => b.appointments.length - a.appointments.length);
    const primary = sorted[0];
    const all = g.flatMap((c) => c.appointments).sort((a, b) => b.startAt.getTime() - a.startAt.getTime());
    return { primary, all, active: all.filter((a) => a.status !== "CANCELLED") };
  });

  return (
    <div className="space-y-4">
      <PageHero title="Clientes" back={{ href: "/admin", label: "Volver a Inicio" }} subtitle="El sistema aprende cuánto tarda cada cliente y reserva ese tiempo en lugar de la duración estándar." />

      <SaveForm action={saveLearnDurations} className="card space-y-3">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="learnDurations" defaultChecked={learn} className="mt-1" />
          <span className="font-medium">Aprender el tiempo real de cada cliente</span>
        </label>
        <Collapsible className="rounded-xl border border-neutral-200 p-2.5" title="Cómo funciona" leading={<Icon name="info" size={18} className="text-neutral-500" />} headerClassName="text-sm">
          <p className="text-sm text-neutral-600">
            Después de cada turno el cliente recibe por WhatsApp una encuesta de 10 segundos («¿cuánto tiempo te llevó?»). Cuando hay {MIN_SAMPLES} respuestas o más, sus próximos turnos se reservan con su tiempo habitual (la mediana de las últimas {WINDOW}).
            Los clientes nuevos, o con pocos datos, usan la duración normal del servicio.
          </p>
        </Collapsible>
        <button className="btn">Guardar</button>
      </SaveForm>

      <form className="flex gap-2" role="search">
        <input name="q" defaultValue={q} placeholder="Buscar por nombre o WhatsApp" className="input" aria-label="Buscar cliente" />
        <button className="btn-ghost">Buscar</button>
      </form>

      {customers.length === 0 && <p className="card text-sm text-neutral-500">{q ? "No encontramos clientes con esa búsqueda." : "Todavía no hay clientes."}</p>}

      {people.map(({ primary: c, all, active }) => {
        const learned = c.appointments.filter((a) => a.actualDurationMin != null && ["CONFIRMED", "COMPLETED"].includes(a.status));
        const answered = learned.length;
        return (
          <details key={c.id} className="card">
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">
                {c.firstName} {c.lastName} <span className="font-normal text-neutral-500">· {prettyPhone(c.phone)}</span>
                {active.length > 1 && <span className="ml-2 rounded-full bg-primary px-2 py-0.5 align-middle text-[11px] font-bold text-on-primary">{active.length} turnos</span>}
              </span>
              <span className="text-xs text-neutral-500">{answered === 0 ? "Sin respuestas todavía" : `${answered} ${answered === 1 ? "respuesta" : "respuestas"}`}</span>
            </summary>

            {all.length > 0 && (
              <ul className="mt-3 divide-y divide-neutral-100 rounded-xl bg-surface-muted px-3 text-sm">
                {all.slice(0, 10).map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-x-3 py-2">
                    <span className="min-w-0">
                      <span className="font-medium">{a.service.name}</span>
                      {a.barber ? <span className="text-neutral-500"> · {a.barber.name}</span> : null}
                    </span>
                    <span className="text-xs text-neutral-500">
                      {DateTime.fromJSDate(a.startAt).setZone(tz).setLocale("es").toFormat("ccc d LLL · HH:mm")}
                      {a.status === "CANCELLED" ? " · cancelado" : a.status === "COMPLETED" ? " · completado" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 divide-y divide-neutral-100">
              {services.map((s) => {
                const adj = c.times.find((t) => t.serviceId === s.id);
                const samples = learned.filter((a) => a.serviceId === s.id && (!adj?.resetAt || a.startAt > adj.resetAt)).map((a) => a.actualDurationMin!);
                const res = learnedMinutes({ samples, standardMin: s.durationMin, overrideMin: adj?.overrideMin });
                const hidden = { customerId: c.id, serviceId: s.id };
                return (
                  <div key={s.id} className="space-y-2 py-3 text-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium">{s.name}</span>
                      <span>
                        <strong>{res.minutes} min</strong> <span className="text-neutral-500">· {SOURCE[res.source]}</span>
                      </span>
                    </div>
                    <div className="text-xs text-neutral-500">
                      Normal: {s.durationMin} min · Respuestas: {samples.length ? samples.slice(0, WINDOW).join(", ") + " min" : "ninguna"}
                      {res.source === "standard" && samples.length > 0 && samples.length < MIN_SAMPLES && ` (faltan ${MIN_SAMPLES - samples.length} para usarlas)`}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <SaveForm action={setCustomerTime} className="flex items-center gap-1.5" successText="Tiempo fijado">
                        <input type="hidden" name="customerId" value={hidden.customerId} />
                        <input type="hidden" name="serviceId" value={hidden.serviceId} />
                        <input name="minutes" type="number" min={5} max={480} step={5} required defaultValue={adj?.overrideMin ?? res.minutes} aria-label={`Minutos para ${s.name}`} className="input !w-20 !py-1 !text-sm" />
                        <button className="btn-ghost !px-2 !py-1 text-xs">Fijar tiempo</button>
                      </SaveForm>
                      {adj?.overrideMin ? (
                        <SaveForm action={clearCustomerTime} successText="Tiempo fijo quitado">
                          <input type="hidden" name="customerId" value={hidden.customerId} />
                          <input type="hidden" name="serviceId" value={hidden.serviceId} />
                          <button className="btn-ghost !px-2 !py-1 text-xs">Quitar tiempo fijo</button>
                        </SaveForm>
                      ) : null}
                      {(samples.length > 0 || adj?.overrideMin) && (
                        <SaveForm action={resetCustomerTime} successText="Reseteado" confirm="¿Ignorar las respuestas anteriores de este cliente y empezar de cero?">
                          <input type="hidden" name="customerId" value={hidden.customerId} />
                          <input type="hidden" name="serviceId" value={hidden.serviceId} />
                          <button className="px-2 py-1 text-xs text-red-600 underline">Resetear</button>
                        </SaveForm>
                      )}
                    </div>
                  </div>
                );
              })}
              {services.length === 0 && <p className="py-3 text-sm text-neutral-500">No hay servicios activos.</p>}
            </div>
          </details>
        );
      })}
      <p className="text-xs text-neutral-500">Mostramos los 40 clientes más recientes; usá el buscador para encontrar a otro. «Resetear» ignora las respuestas anteriores y empieza a aprender de nuevo.</p>
    </div>
  );
}
