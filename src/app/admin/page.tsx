import { DateTime } from "luxon";
import type { Prisma } from "@prisma/client";
import { prisma, getBusinessById } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime, fmtTime, money } from "@/lib/format";
import { cancelAppointment, setAppointmentStatus, markAppointmentPaid } from "./actions";

type Appt = Prisma.AppointmentGetPayload<{ include: { customer: true; service: true; barber: true; events: true } }>;

const ACTOR = { CLIENT: "El cliente", ADMIN: "Administración", SYSTEM: "El sistema" } as const;

/** Código de reclamo + historial de cambios del turno (creación, reprogramaciones, cancelaciones). */
function History({ a, tz }: { a: Appt; tz: string }) {
  if (!a.claimCode && a.events.length === 0) return null;
  const moved = a.events.filter((e) => e.kind === "RESCHEDULED").length;
  return (
    <details className="mt-1 text-xs text-neutral-500">
      <summary className="cursor-pointer select-none">
        {a.claimCode && <span className="font-mono">{a.claimCode}</span>}
        {moved > 0 && <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-violet-800">Reprogramado{moved > 1 ? ` ×${moved}` : ""}</span>}
        <span className="ml-2 underline">Historial</span>
      </summary>
      <ul className="mt-1 space-y-0.5 border-l-2 border-neutral-200 pl-2">
        {a.events.map((e) => (
          <li key={e.id}>
            {fmtDateTime(e.createdAt, tz)} ·{" "}
            {e.kind === "CREATED" && (e.note ? `Turno confirmado (${e.note.toLowerCase()})` : "Turno creado")}
            {e.kind === "RESCHEDULED" && `${ACTOR[e.actor]} reprogramó: ${e.fromStartAt ? fmtDateTime(e.fromStartAt, tz) : "?"} → ${e.toStartAt ? fmtDateTime(e.toStartAt, tz) : "?"}`}
            {e.kind === "CANCELLED" && `${ACTOR[e.actor]} canceló el turno${e.note ? ` (${e.note})` : ""}`}
          </li>
        ))}
      </ul>
    </details>
  );
}

function PayBadge({ a, currency }: { a: Appt; currency: string }) {
  if (a.status === "PENDING_PAYMENT") return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Esperando pago</span>;
  if (a.paymentStatus === "PAID") return <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">Pagado</span>;
  if (a.paymentStatus === "PENDING_AT_STORE")
    return <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-800">Pago pendiente en el local</span>;
  if (a.paymentStatus === "DEPOSIT_PAID")
    return (
      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800">
        Seña {money(a.amountPaidCents, currency)} · falta {money(a.priceCents - a.amountPaidCents, currency)}
      </span>
    );
  return null;
}

function Row({ a, tz, currency, showDate }: { a: Appt; tz: string; currency: string; showDate?: boolean }) {
  const active = a.status === "CONFIRMED";
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <div className="w-24 shrink-0 font-semibold tabular-nums">{showDate ? fmtDateTime(a.startAt, tz) : fmtTime(a.startAt, tz)}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">
          {a.customer.firstName} {a.customer.lastName}
        </div>
        <div className="truncate text-sm text-neutral-500">
          {a.service.name} · {a.barber?.name ?? "Profesional eliminado"} ·{" "}
          <a className="underline" href={`https://wa.me/${a.customer.phone.replace("+", "")}`} target="_blank">
            {a.customer.phone}
          </a>{" "}
          <PayBadge a={a} currency={currency} />
        </div>
        <History a={a} tz={tz} />
      </div>
      {active ? (
        <div className="flex gap-2">
          {a.paymentStatus !== "PAID" && (
            <form action={markAppointmentPaid}>
              <input type="hidden" name="id" value={a.id} />
              <button className="btn-ghost" title="Marcar como cobrado en el local">Cobrado</button>
            </form>
          )}
          <form action={setAppointmentStatus}>
            <input type="hidden" name="id" value={a.id} />
            <input type="hidden" name="status" value="COMPLETED" />
            <button className="btn-ghost">Completado</button>
          </form>
          <form action={cancelAppointment}>
            <input type="hidden" name="id" value={a.id} />
            <button className="btn-ghost !text-red-600">Cancelar</button>
          </form>
        </div>
      ) : (
        <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs">{a.status}</span>
      )}
    </li>
  );
}

export default async function DashboardPage() {
  const { businessId } = await requireAdmin();
  const b = await getBusinessById(businessId);
  const tz = b.timezone;

  const now = DateTime.now().setZone(tz);
  const todayStart = now.startOf("day");
  const tomorrow = todayStart.plus({ days: 1 });
  const weekEnd = todayStart.plus({ days: 8 });
  const include = { customer: true, service: true, barber: true, events: { orderBy: { createdAt: "asc" } } } as const;

  const [today, upcoming, newCustomers] = await Promise.all([
    prisma.appointment.findMany({
      where: { businessId, startAt: { gte: todayStart.toJSDate(), lt: tomorrow.toJSDate() } },
      include,
      orderBy: { startAt: "asc" },
    }),
    prisma.appointment.findMany({
      where: { businessId, status: "CONFIRMED", startAt: { gte: tomorrow.toJSDate(), lt: weekEnd.toJSDate() } },
      include,
      orderBy: { startAt: "asc" },
    }),
    prisma.customer.count({ where: { businessId, createdAt: { gte: now.minus({ days: 7 }).toJSDate() } } }),
  ]);

  const live = today.filter((a) => a.status !== "CANCELLED" && a.status !== "NO_SHOW" && a.status !== "PENDING_PAYMENT");
  const revenue = live.reduce((s, a) => s + a.priceCents, 0);

  const stats = [
    { label: "Turnos hoy", value: live.length },
    { label: "Ingresos estimados hoy", value: money(revenue, b.currency) },
    { label: "Próximos 7 días", value: upcoming.length },
    { label: "Clientes nuevos (7d)", value: newCustomers },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card">
            <div className="text-2xl font-bold">{s.value}</div>
            <div className="text-xs text-neutral-500">{s.label}</div>
          </div>
        ))}
      </div>

      <section className="card">
        <h2 className="mb-1 font-semibold">Hoy · {now.setLocale("es").toFormat("cccc d 'de' LLLL")}</h2>
        {today.length === 0 ? (
          <p className="py-4 text-sm text-neutral-500">No hay turnos para hoy.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {today.map((a) => (
              <Row key={a.id} a={a} tz={tz} currency={b.currency} />
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="mb-1 font-semibold">Próximos 7 días</h2>
        {upcoming.length === 0 ? (
          <p className="py-4 text-sm text-neutral-500">Sin turnos próximos.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {upcoming.map((a) => (
              <Row key={a.id} a={a} tz={tz} currency={b.currency} showDate />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
