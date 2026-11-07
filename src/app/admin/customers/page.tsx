import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { prettyPhone } from "@/lib/profile";
import { learnedMinutes, MIN_SAMPLES, WINDOW } from "@/lib/learned-duration";
import { clearCustomerTime, resetCustomerTime, saveLearnDurations, setCustomerTime } from "./actions";

export const dynamic = "force-dynamic";

const SOURCE = { standard: "Duración normal", learned: "Aprendido", override: "Fijado por vos" } as const;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { businessId } = await requireAdmin();
  const q = ((await searchParams).q ?? "").trim().slice(0, 60);

  const [business, services, customers] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId }, select: { learnDurations: true } }),
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
        appointments: { where: { actualDurationMin: { not: null }, status: { in: ["CONFIRMED", "COMPLETED"] } }, orderBy: { startAt: "desc" }, select: { serviceId: true, actualDurationMin: true, startAt: true } },
      },
    }),
  ]);
  const learn = business?.learnDurations ?? false;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Clientes y tiempos</h1>
        <p className="text-sm text-neutral-500">El sistema aprende cuánto tarda cada cliente y reserva ese tiempo en lugar de la duración estándar.</p>
      </div>

      <form action={saveLearnDurations} className="card space-y-3">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="learnDurations" defaultChecked={learn} className="mt-1" />
          <span>
            <span className="font-medium">Aprender el tiempo real de cada cliente</span>
            <span className="block text-neutral-500">
              Después de cada turno el cliente recibe por WhatsApp una encuesta de 10 segundos («¿cuánto tiempo te llevó?»). Cuando hay {MIN_SAMPLES} respuestas o más, sus próximos turnos se reservan con su tiempo habitual (la mediana de las últimas {WINDOW}).
              Los clientes nuevos, o con pocos datos, usan la duración normal del servicio.
            </span>
          </span>
        </label>
        <button className="btn">Guardar</button>
      </form>

      <form className="flex gap-2" role="search">
        <input name="q" defaultValue={q} placeholder="Buscar por nombre o WhatsApp" className="input" aria-label="Buscar cliente" />
        <button className="btn-ghost">Buscar</button>
      </form>

      {customers.length === 0 && <p className="card text-sm text-neutral-500">{q ? "No encontramos clientes con esa búsqueda." : "Todavía no hay clientes."}</p>}

      {customers.map((c) => {
        const answered = c.appointments.length;
        return (
          <details key={c.id} className="card">
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">
                {c.firstName} {c.lastName} <span className="font-normal text-neutral-500">· {prettyPhone(c.phone)}</span>
              </span>
              <span className="text-xs text-neutral-500">{answered === 0 ? "Sin respuestas todavía" : `${answered} ${answered === 1 ? "respuesta" : "respuestas"}`}</span>
            </summary>

            <div className="mt-3 divide-y divide-neutral-100">
              {services.map((s) => {
                const adj = c.times.find((t) => t.serviceId === s.id);
                const samples = c.appointments.filter((a) => a.serviceId === s.id && (!adj?.resetAt || a.startAt > adj.resetAt)).map((a) => a.actualDurationMin!);
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
                      <form action={setCustomerTime} className="flex items-center gap-1.5">
                        <input type="hidden" name="customerId" value={hidden.customerId} />
                        <input type="hidden" name="serviceId" value={hidden.serviceId} />
                        <input name="minutes" type="number" min={5} max={480} step={5} required defaultValue={adj?.overrideMin ?? res.minutes} aria-label={`Minutos para ${s.name}`} className="input !w-20 !py-1 !text-sm" />
                        <button className="btn-ghost !px-2 !py-1 text-xs">Fijar tiempo</button>
                      </form>
                      {adj?.overrideMin ? (
                        <form action={clearCustomerTime}>
                          <input type="hidden" name="customerId" value={hidden.customerId} />
                          <input type="hidden" name="serviceId" value={hidden.serviceId} />
                          <button className="btn-ghost !px-2 !py-1 text-xs">Quitar tiempo fijo</button>
                        </form>
                      ) : null}
                      {(samples.length > 0 || adj?.overrideMin) && (
                        <form action={resetCustomerTime}>
                          <input type="hidden" name="customerId" value={hidden.customerId} />
                          <input type="hidden" name="serviceId" value={hidden.serviceId} />
                          <button className="px-2 py-1 text-xs text-red-600 underline">Resetear</button>
                        </form>
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
