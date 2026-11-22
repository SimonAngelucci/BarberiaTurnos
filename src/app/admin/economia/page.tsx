import { Collapsible } from "@/components/ui/Collapsible";
import { IconButton } from "@/components/ui/IconButton";
import { Icon } from "@/components/ui/Icon";
import { DateTime } from "luxon";
import { prisma, getBusinessById } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { money } from "@/lib/format";
import { change, summarize, type Period } from "@/lib/economy";
import { SaveForm } from "@/components/SaveForm";
import { addManualIncome, deleteManualIncome } from "./actions";

export const dynamic = "force-dynamic";

function Delta({ cur, prev, what }: { cur: number; prev: number; what: string }) {
  const c = change(cur, prev);
  if (c === null) return <span className="text-xs text-neutral-500">Sin datos de {what} para comparar</span>;
  const up = c >= 0;
  return (
    <span className={`text-xs font-semibold ${up ? "text-green-700" : "text-red-700"}`}>
      <Icon name={up ? "trending-up" : "trending-down"} size={14} className="mr-0.5 inline -translate-y-px" />{Math.abs(c)}% <span className="font-normal text-neutral-500">vs {what}</span>
    </span>
  );
}

function Summary({ p, prev, prevWhat, currency }: { p: Period; prev: Period; prevWhat: string; currency: string }) {
  return (
    <section className="card space-y-2" aria-label={p.label}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{p.label}</h2>
      <div className="text-3xl font-extrabold tabular-nums">{money(p.totalCents, currency)}</div>
      <Delta cur={p.totalCents} prev={prev.totalCents} what={prevWhat} />
      <dl className="grid grid-cols-3 gap-2 border-t border-neutral-100 pt-2 text-sm">
        <div>
          <dt className="text-xs text-neutral-500">Turnos ({p.count})</dt>
          <dd className="font-semibold tabular-nums">{money(p.turnosCents, currency)}</dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-500">Manuales</dt>
          <dd className="font-semibold tabular-nums">{money(p.manualCents, currency)}</dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-500">Promedio / turno</dt>
          <dd className="font-semibold tabular-nums">{p.count ? money(Math.round(p.turnosCents / p.count), currency) : "—"}</dd>
        </div>
      </dl>
    </section>
  );
}

/** Monto corto para encima de las barras ($1,2M, $815k, $950): evita que los números se pisen en barras angostas. */
function compact(cents: number) {
  const v = cents / 100;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1).replace(".", ",").replace(",0", "")}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}k`;
  return `$${Math.round(v)}`;
}

/**
 * Gráfico de barras (turnos + manuales apilados) sin librerías: columnas redondeadas que crecen al entrar, guías de fondo y el
 * valor compacto arriba de cada barra. La barra marcada (hoy) lleva el monto completo en una etiqueta de color.
 */
function Bars({ items, currency, highlight }: { items: { label: string; turnosCents: number; manualCents: number; totalCents: number; today?: boolean }[]; currency: string; highlight?: boolean }) {
  const max = Math.max(1, ...items.map((i) => i.totalCents));
  return (
    <div role="img" aria-label="Gráfico de ingresos">
      <div className="relative h-52">
        {/* Guías horizontales */}
        {[0, 50, 100].map((g) => (
          <div key={g} aria-hidden className="pointer-events-none absolute inset-x-0 border-t border-dashed border-neutral-200" style={{ bottom: `${g * 0.82}%` }} />
        ))}
        <div className="absolute inset-0 flex items-end gap-1.5 sm:gap-3">
          {items.map((i, n) => {
            const on = !!(highlight && i.today);
            const pct = i.totalCents ? Math.max(4, (i.totalCents / max) * 82) : 1.5;
            return (
              <div key={i.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5" title={`${i.label}: ${money(i.totalCents, currency)}`}>
                {i.totalCents > 0 && (
                  <span className={on ? "whitespace-nowrap rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold tabular-nums text-brand-fg" : "whitespace-nowrap text-[11px] font-semibold tabular-nums text-neutral-500"}>
                    {on ? money(i.totalCents, currency).replace(/\D00$|,00$/, "") : compact(i.totalCents)}
                  </span>
                )}
                <div
                  className="animate-grow flex w-full max-w-[2.75rem] origin-bottom flex-col justify-end overflow-hidden rounded-t-2xl rounded-b-md"
                  style={{ height: `${pct}%`, animationDelay: `${n * 45}ms`, opacity: on || !highlight ? 1 : 0.55 }}
                >
                  <div className="bg-teal-400" style={{ height: `${i.totalCents ? (i.manualCents / i.totalCents) * 100 : 0}%` }} />
                  <div className="flex-1 bg-brand" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex gap-1.5 sm:gap-3">
        {items.map((i) => (
          <span key={i.label} className={`min-w-0 flex-1 truncate text-center text-[11px] ${highlight && i.today ? "font-bold text-neutral-900" : "text-neutral-500"}`}>
            {i.label}
          </span>
        ))}
      </div>
    </div>
  );
}
export default async function EconomyPage() {
  const { businessId } = await requireAdmin();
  const b = await getBusinessById(businessId);
  const tz = b.timezone;
  const now = new Date();
  const nowL = DateTime.fromJSDate(now).setZone(tz);
  // Se miran los últimos 6 meses completos + el actual (alcanza para las 8 semanas y los 6 meses del gráfico).
  const since = nowL.startOf("month").minus({ months: 6 }).toJSDate();

  const [appts, manual, services] = await Promise.all([
    prisma.appointment.findMany({
      where: { businessId, startAt: { gte: since }, status: { in: ["CONFIRMED", "COMPLETED"] } },
      select: { startAt: true, endAt: true, status: true, priceCents: true, serviceId: true },
    }),
    prisma.manualIncome.findMany({ where: { businessId, date: { gte: since } }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], select: { id: true, date: true, amountCents: true, description: true } }),
    prisma.service.findMany({ where: { businessId }, select: { id: true, name: true } }),
  ]);

  const s = summarize({ appts, manual, now, tz, serviceNames: new Map(services.map((x) => [x.id, x.name])) });
  const c = b.currency;
  const monthStart = nowL.startOf("month").toMillis();
  const recent = manual.filter((m) => m.date.getTime() >= monthStart - 31 * 86400_000).slice(0, 30);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Economía</h1>
        <Collapsible className="mt-2" title="¿Cómo se calcula?" leading={<Icon name="info" size={18} className="text-neutral-500" />} headerClassName="text-sm text-neutral-600">
          <p className="text-sm text-neutral-500">
            Ingresos por turnos realizados (completados, o confirmados cuyo horario ya pasó) más los montos que cargues a mano. Los turnos cancelados o ausentes no suman.
          </p>
        </Collapsible>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Summary p={s.week} prev={s.prevWeek} prevWhat="la semana anterior" currency={c} />
        <Summary p={s.month} prev={s.prevMonth} prevWhat="el mes anterior" currency={c} />
      </div>

      {s.pendingCount > 0 && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          <Icon name="hourglass" size={16} className="mr-1 inline -translate-y-px" />Tenés <strong>{s.pendingCount}</strong> {s.pendingCount === 1 ? "turno agendado" : "turnos agendados"} este mes que todavía no se {s.pendingCount === 1 ? "hizo" : "hicieron"}:{" "}
          <strong>{money(s.pendingCents, c)}</strong> más cuando se realicen.
        </p>
      )}

      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Esta semana, día por día</h2>
          <span className="flex items-center gap-3 text-xs text-neutral-500">
            <span className="flex items-center gap-1">
              <i className="inline-block h-2.5 w-2.5 rounded-sm bg-brand" /> Turnos
            </span>
            <span className="flex items-center gap-1">
              <i className="inline-block h-2.5 w-2.5 rounded-sm bg-teal-400" /> Manuales
            </span>
          </span>
        </div>
        <Bars items={s.days} currency={c} highlight />
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Últimas 8 semanas</h2>
        <Bars items={s.weeks} currency={c} />
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card">
          <h2 className="mb-2 font-semibold">Por mes</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-neutral-500">
                <th className="py-1 font-medium">Mes</th>
                <th className="py-1 text-right font-medium">Turnos</th>
                <th className="py-1 text-right font-medium">Manuales</th>
                <th className="py-1 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 tabular-nums">
              {[...s.months].reverse().map((m) => (
                <tr key={m.label}>
                  <td className="py-1.5 capitalize">{m.label}</td>
                  <td className="py-1.5 text-right">{money(m.turnosCents, c)}</td>
                  <td className="py-1.5 text-right">{money(m.manualCents, c)}</td>
                  <td className="py-1.5 text-right font-semibold">{money(m.totalCents, c)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card">
          <h2 className="mb-2 font-semibold">Servicios que más dejan (este mes)</h2>
          {s.topServices.length === 0 ? (
            <p className="py-3 text-sm text-neutral-500">Todavía no hay turnos realizados este mes.</p>
          ) : (
            <ol className="space-y-2 text-sm">
              {s.topServices.map((t, i) => (
                <li key={t.name} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate">
                    <span className="mr-2 text-neutral-400">{i + 1}.</span>
                    {t.name} <span className="text-neutral-500">({t.count})</span>
                  </span>
                  <span className="font-semibold tabular-nums">{money(t.cents, c)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section className="card space-y-3">
        <div>
          <h2 className="font-semibold">Sumar un ingreso manual</h2>
          <p className="text-sm text-neutral-500">Para ventas de productos u otros ingresos que no vienen de un turno. Se suman a los totales de la semana y del mes que corresponda.</p>
        </div>
        <SaveForm action={addManualIncome} className="grid gap-3 sm:grid-cols-5" successText="Ingreso agregado" resetOnSuccess>
          <div className="sm:col-span-2">
            <label className="label">Descripción</label>
            <input name="description" required maxLength={100} className="input" placeholder="Ej: Venta de shampoo" />
          </div>
          <div>
            <label className="label">Monto</label>
            <input name="amount" type="number" inputMode="decimal" min="0.01" step="0.01" required className="input" placeholder="0,00" />
          </div>
          <div>
            <label className="label">Fecha</label>
            <input name="date" type="date" required defaultValue={nowL.toISODate() ?? undefined} className="input" />
          </div>
          <div className="flex items-end">
            <button className="btn w-full">Agregar</button>
          </div>
        </SaveForm>

        {recent.length === 0 ? (
          <p className="text-sm text-neutral-500">Todavía no cargaste ingresos manuales.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {recent.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate">
                  <span className="mr-2 tabular-nums text-neutral-500">{DateTime.fromJSDate(m.date).setZone(tz).setLocale("es").toFormat("ccc d LLL")}</span>
                  {m.description}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <strong className="tabular-nums">{money(m.amountCents, c)}</strong>
                  <SaveForm action={deleteManualIncome} successText="Ingreso eliminado" confirm="¿Eliminar este ingreso manual?">
                    <input type="hidden" name="id" value={m.id} />
                    <IconButton type="submit" icon="trash" label="Quitar ingreso" variant="danger" />
                  </SaveForm>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
