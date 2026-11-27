import { headers } from "next/headers";
import { DateTime } from "luxon";
import { prisma, getBusinessById } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { money } from "@/lib/format";
import { summarize } from "@/lib/economy";
import { CopyLink } from "@/components/CopyLink";
import { agendaDays } from "@/lib/agenda";
import { computeStarts } from "@/lib/booking-days";
import { barberColors } from "@/lib/barber-colors";
import { HOLD_MINUTES } from "@/lib/payment-math";
import { TurnosBoard, type BoardAppt, type BoardMonth } from "@/components/TurnosBoard";
import type { AgendaBlock } from "@/components/AgendaBoard";

export const dynamic = "force-dynamic";

/** Pestaña Turnos (/admin/turnos): resumen de los últimos 3 meses y los próximos turnos con color de alerta según la cercanía. */
export default async function TurnosPage({ searchParams }: { searchParams: Promise<{ semana?: string }> }) {
  const { businessId } = await requireAdmin();
  const b = await getBusinessById(businessId);
  const sp = await searchParams;
  const now = new Date();
  const nowL = DateTime.fromJSDate(now).setZone(b.timezone).setLocale("es");
  const since = nowL.startOf("month").minus({ months: 2 }).toJSDate();

  // Agenda por profesional: 7 días (desde hoy, o desde la fecha elegida para bloquear con anticipación), con los huecos libres
  // de cada uno (mismas reglas que la reserva online) y los bloqueos.
  const days = agendaDays(b.timezone, DateTime.fromJSDate(now), sp.semana);
  const winStart = DateTime.fromISO(days[0], { zone: b.timezone }).startOf("day");
  const winEnd = winStart.plus({ days: 7 });
  const [barbers, services, slotRows, taken, offs] = await Promise.all([
    prisma.barber.findMany({ where: { businessId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, photoUrl: true, color: true } }),
    prisma.service.findMany({ where: { businessId, active: true, comingSoon: false }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, durationMin: true } }),
    prisma.timeSlot.findMany({ where: { barber: { businessId, active: true } }, select: { barberId: true, weekday: true, startMin: true } }),
    prisma.appointment.findMany({
      where: {
        businessId,
        status: { not: "CANCELLED" },
        NOT: { status: "PENDING_PAYMENT", createdAt: { lt: new Date(Date.now() - HOLD_MINUTES * 60_000) } },
        startAt: { gte: winStart.toJSDate(), lt: winEnd.toJSDate() },
      },
      select: { barberId: true, startAt: true },
    }),
    prisma.timeOff.findMany({ where: { businessId, startAt: { lt: winEnd.toJSDate() }, endAt: { gt: winStart.toJSDate() } }, orderBy: { startAt: "asc" }, select: { id: true, barberId: true, startAt: true, endAt: true, reason: true, groupId: true } }),
  ]);
  // Cuántas repeticiones próximas tiene cada bloqueo que se repite (para ofrecer «quitar toda la serie»).
  const groupIds = [...new Set(offs.map((o) => o.groupId).filter((g): g is string => !!g))];
  const groupCounts = groupIds.length ? await prisma.timeOff.groupBy({ by: ["groupId"], where: { businessId, groupId: { in: groupIds }, endAt: { gt: now } }, _count: { _all: true } }) : [];
  const seriesOf = new Map(groupCounts.map((g) => [g.groupId, g._count._all]));
  const blocks: AgendaBlock[] = offs.map((o) => ({ id: o.id, barberId: o.barberId, startAt: o.startAt.toISOString(), endAt: o.endAt.toISOString(), reason: o.reason, series: o.groupId ? (seriesOf.get(o.groupId) ?? 1) : 1 }));
  const colors = barberColors(barbers);
  const free: { barberId: string; startAt: string }[] = [];
  for (const iso of days) {
    const day = DateTime.fromISO(iso, { zone: b.timezone }).startOf("day");
    const wd = day.weekday % 7;
    for (const br of barbers) {
      const starts = computeStarts({
        day,
        slotMins: slotRows.filter((s) => s.barberId === br.id && s.weekday === wd).map((s) => s.startMin).sort((x, y) => x - y),
        now: nowL,
        minNoticeMin: b.minNoticeMin,
        takenMs: new Set(taken.filter((t) => t.barberId === br.id).map((t) => t.startAt.getTime())),
        timeOffs: offs.filter((o) => o.barberId === br.id || o.barberId === null),
      });
      for (const ms of starts) free.push({ barberId: br.id, startAt: new Date(ms).toISOString() });
    }
  }

  const [rows, eco, manual, weekRows] = await Promise.all([
    prisma.appointment.findMany({
      where: { businessId, status: "CONFIRMED", endAt: { gt: now }, startAt: { lt: new Date(now.getTime() + 7 * 86400_000) } },
      orderBy: { startAt: "asc" },
      include: { customer: true, service: true, barber: true },
    }),
    prisma.appointment.findMany({
      where: { businessId, startAt: { gte: since }, status: { in: ["CONFIRMED", "COMPLETED"] } },
      select: { startAt: true, endAt: true, status: true, priceCents: true, serviceId: true },
    }),
    prisma.manualIncome.findMany({ where: { businessId, date: { gte: since } }, select: { date: true, amountCents: true } }),
    prisma.appointment.findMany({
      where: { businessId, status: "CONFIRMED", endAt: { gt: now }, startAt: { gte: winStart.toJSDate(), lt: winEnd.toJSDate() } },
      orderBy: { startAt: "asc" },
      include: { customer: true, service: true, barber: true },
    }),
  ]);

  const toBoard = (a: (typeof rows)[number]): BoardAppt => {
    const paid = a.paymentStatus === "PAID" ? "PAID" : a.paymentStatus === "DEPOSIT_PAID" ? "DEPOSIT" : a.paymentStatus === "PENDING_AT_STORE" ? "STORE" : "NONE";
    return {
      id: a.id,
      startAt: a.startAt.toISOString(),
      endAt: a.endAt.toISOString(),
      customer: `${a.customer.firstName} ${a.customer.lastName}`,
      phone: a.customer.phone,
      service: a.service.name,
      barber: a.barber?.name ?? null,
      barberId: a.barberId,
      paid,
      paidLabel:
        paid === "PAID"
          ? "Pagado"
          : paid === "DEPOSIT"
            ? `Seña ${money(a.amountPaidCents, b.currency)} · falta ${money(a.priceCents - a.amountPaidCents, b.currency)}`
            : "Cobrar en el local",
      dueCents: paid === "PAID" ? 0 : Math.max(0, a.priceCents - a.amountPaidCents),
    };
  };
  const appts = rows.map(toBoard);
  const maxAdvanceIso = nowL.startOf("day").plus({ days: b.maxAdvanceDays }).toISODate()!;

  // Ingresos de los últimos 3 meses (mismo cálculo que Economía: turnos realizados + ingresos manuales).
  const s = summarize({ appts: eco, manual, now, tz: b.timezone, serviceNames: new Map() });
  const months: BoardMonth[] = s.months.slice(-3).map((m, i) => ({
    label: nowL.startOf("month").minus({ months: 2 - i }).toFormat("LLL").replace(".", ""),
    amount: money(m.totalCents, b.currency),
    current: i === 2,
  }));

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  return (
    <TurnosBoard
      appts={appts}
      tz={b.timezone}
      months={months}
      agenda={{
        barbers: barbers.map((x) => ({ id: x.id, name: x.name, photoUrl: x.photoUrl, color: colors.get(x.id)! })),
        services,
        days,
        free,
        appts: weekRows.map(toBoard),
        blocks,
        today: nowL.toISODate()!,
        maxAdvanceIso,
      }}
      due={money(appts.reduce((sum, a) => sum + a.dueCents, 0), b.currency)}
      footer={
        <div className="card !py-2">
          <div className="text-xs text-neutral-500">Link directo a esta vista (te pide ingresar con tu cuenta)</div>
          <CopyLink url={`${proto}://${host}/admin/turnos`} />
        </div>
      }
    />
  );
}
