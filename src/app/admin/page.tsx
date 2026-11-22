import { DateTime } from "luxon";
import type { Prisma } from "@prisma/client";
import { prisma, getBusinessById } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime, fmtTime, money } from "@/lib/format";
import { QuickLinks, PANEL_SHORTCUTS as GO } from "@/components/ui/QuickLinks";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { Hero } from "@/components/ui/Hero";
import { FolderTabs, type FolderTab } from "@/components/ui/FolderTabs";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { NextCountdown } from "@/components/NextCountdown";
import { ServiceIcon } from "@/components/ServiceIcon";
import type { BusinessType } from "@/lib/service-icons";
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

function Stat({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`min-w-0 flex-1 border-l-2 pl-3 ${accent ? "border-primary-strong" : "border-current/0"}`} style={accent ? undefined : { borderColor: "color-mix(in srgb, currentColor 14%, transparent)" }}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</div>
      <div className="mt-0.5 whitespace-nowrap text-base font-semibold tabular-nums">{value}</div>
    </div>
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

  const [today, upcoming, newCustomers, nextAppt, services, paid] = await Promise.all([
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
    prisma.appointment.findFirst({
      where: { businessId, status: "CONFIRMED", startAt: { gte: now.toJSDate() } },
      orderBy: { startAt: "asc" },
      include: { customer: true, service: true },
    }),
    prisma.service.findMany({ where: { businessId, archived: false, active: true }, orderBy: { sortOrder: "asc" }, take: 6 }),
    prisma.appointment.findMany({
      where: { businessId, status: { in: ["CONFIRMED", "COMPLETED"] }, paymentStatus: { in: ["PAID", "DEPOSIT_PAID"] } },
      orderBy: { startAt: "desc" },
      take: 4,
      include: { customer: true, service: true },
    }),
  ]);

  const live = today.filter((a) => a.status !== "CANCELLED" && a.status !== "NO_SHOW" && a.status !== "PENDING_PAYMENT");
  const revenueToday = live.reduce((s, a) => s + a.priceCents, 0);
  const weekAppts = [...live.filter((a) => a.status === "CONFIRMED" || a.status === "COMPLETED"), ...upcoming];
  const revenueWeek = weekAppts.reduce((s, a) => s + a.priceCents, 0);

  // Turnos por servicio en los próximos 7 días (hoy incluido): la barra de cada tarjeta es relativa al servicio con más turnos.
  const perService = new Map<string, number>();
  for (const a of weekAppts) perService.set(a.serviceId, (perService.get(a.serviceId) ?? 0) + 1);
  const maxPerService = Math.max(1, ...perService.values());
  const type = b.businessType as BusinessType;

  const tabs: FolderTab[] = [
    {
      id: "hoy",
      label: "Hoy",
      count: live.length,
      content: (
        <div className="space-y-4">
          <SectionLabel as="p">Próximo turno en</SectionLabel>
          {nextAppt ? (
            <>
              <NextCountdown startAt={nextAppt.startAt.toISOString()} nowAt={new Date().toISOString()} />
              <p className="truncate text-sm text-muted">
                {fmtDateTime(nextAppt.startAt, tz)} · {nextAppt.customer.firstName} {nextAppt.customer.lastName} · {nextAppt.service.name}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">No hay turnos próximos agendados.</p>
          )}
          <div className="flex gap-3 border-t pt-4" style={{ borderColor: "color-mix(in srgb, currentColor 12%, transparent)" }}>
            <Stat label="Turnos hoy" value={live.length} accent />
            <Stat label="Ingresos estimados" value={money(revenueToday, b.currency)} />
          </div>
        </div>
      ),
    },
    {
      id: "semana",
      label: "Semana",
      count: weekAppts.length,
      content: (
        <div className="space-y-4">
          <SectionLabel as="p">Próximos 7 días</SectionLabel>
          <div className="grid grid-cols-2 gap-x-3 gap-y-4">
            <Stat label="Turnos" value={weekAppts.length} accent />
            <Stat label="Clientes nuevos" value={newCustomers} />
            <div className="col-span-2">
              <Stat label="Ingresos estimados" value={money(revenueWeek, b.currency)} />
            </div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      <Hero>
        <FolderTabs tabs={tabs} label="Resumen" />
      </Hero>

      <QuickLinks items={[GO.clientes, GO.profesionales, GO.pagos, GO.personalizacion]} />

      <section className="space-y-3">
        <SectionLabel count={services.length}>Servicios</SectionLabel>
        {services.length === 0 ? (
          <Link href="/admin/services" className="card block text-sm">
            Todavía no cargaste servicios. <span className="font-semibold underline">Crear el primero</span>
          </Link>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {services.map((s, n) => {
              const dark = n % 2 === 0;
              const count = perService.get(s.id) ?? 0;
              return (
                <Link key={s.id} href="/admin/services" className={`card flex flex-col !rounded-[1.75rem] ${dark ? "card-ink" : ""}`}>
                  <ServiceIcon iconKey={s.iconKey} iconUrl={s.iconUrl} type={type} size={44} className={`!rounded-2xl ${dark ? "!bg-ink-soft !text-primary" : "!bg-surface-muted !text-inherit"}`} />
                  <div className={`mt-8 break-words text-base font-semibold leading-tight ${dark ? "text-primary" : ""}`}>{s.name.charAt(0).toUpperCase() + s.name.slice(1)}</div>
                  <span className="mt-2 inline-flex w-fit rounded-lg border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider" style={{ borderColor: "color-mix(in srgb, currentColor 35%, transparent)" }}>
                    {s.durationMin} min
                  </span>
                  <div className="mt-4 h-1.5 overflow-hidden rounded-full" style={{ background: "color-mix(in srgb, currentColor 15%, transparent)" }} role="img" aria-label={`${count} turnos en los próximos 7 días`}>
                    <div className={`h-full rounded-full ${dark ? "bg-primary" : "bg-primary-strong"}`} style={{ width: `${Math.max(count > 0 ? 8 : 0, Math.round((count / maxPerService) * 100))}%` }} />
                  </div>
                  <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">
                    {count} {count === 1 ? "turno" : "turnos"} · 7 días
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <SectionLabel count={today.length}>Turnos de hoy</SectionLabel>
        <div className="card">
          <p className="text-sm capitalize text-muted">{now.setLocale("es").toFormat("cccc d 'de' LLLL")}</p>
          {today.length === 0 ? (
            <p className="py-4 text-sm text-muted">No hay turnos para hoy.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {today.map((a) => (
                <Row key={a.id} a={a} tz={tz} currency={b.currency} />
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <SectionLabel count={upcoming.length}>Próximos 7 días</SectionLabel>
        <div className="card">
          {upcoming.length === 0 ? (
            <p className="py-4 text-sm text-muted">Sin turnos próximos.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {upcoming.map((a) => (
                <Row key={a.id} a={a} tz={tz} currency={b.currency} showDate />
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <SectionLabel>Pagos</SectionLabel>
        {paid.length === 0 ? (
          <div className="card text-sm text-muted">Todavía no hay cobros registrados.</div>
        ) : (
          <ul className="space-y-1">
            {paid.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-1 py-2">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-muted">
                  <Icon name="credit-card" size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">
                    {a.customer.firstName} {a.customer.lastName}
                  </div>
                  <div className="truncate text-xs text-muted">{a.service.name}</div>
                </div>
                <div className="text-sm font-semibold tabular-nums">{money(a.amountPaidCents > 0 ? a.amountPaidCents : a.priceCents, b.currency)}</div>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-center">
          <Link href="/admin/economia" className="btn-ghost !px-4 !py-1.5 text-[11px] uppercase tracking-[0.14em]">
            Ver todo
          </Link>
        </div>
      </section>
    </div>
  );
}
