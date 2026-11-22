import { headers } from "next/headers";
import { DateTime } from "luxon";
import { prisma, getBusinessById } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { money } from "@/lib/format";
import { summarize } from "@/lib/economy";
import { CopyLink } from "@/components/CopyLink";
import { TurnosBoard, type BoardAppt, type BoardMonth } from "@/components/TurnosBoard";

export const dynamic = "force-dynamic";

/** Pestaña Turnos (/admin/turnos): resumen de los últimos 3 meses y los próximos turnos con color de alerta según la cercanía. */
export default async function TurnosPage() {
  const { businessId } = await requireAdmin();
  const b = await getBusinessById(businessId);
  const now = new Date();
  const nowL = DateTime.fromJSDate(now).setZone(b.timezone).setLocale("es");
  const since = nowL.startOf("month").minus({ months: 2 }).toJSDate();

  const [rows, eco, manual] = await Promise.all([
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
  ]);

  const appts: BoardAppt[] = rows.map((a) => {
    const paid = a.paymentStatus === "PAID" ? "PAID" : a.paymentStatus === "DEPOSIT_PAID" ? "DEPOSIT" : a.paymentStatus === "PENDING_AT_STORE" ? "STORE" : "NONE";
    return {
      id: a.id,
      startAt: a.startAt.toISOString(),
      endAt: a.endAt.toISOString(),
      customer: `${a.customer.firstName} ${a.customer.lastName}`,
      phone: a.customer.phone,
      service: a.service.name,
      barber: a.barber?.name ?? null,
      paid,
      paidLabel:
        paid === "PAID"
          ? "Pagado"
          : paid === "DEPOSIT"
            ? `Seña ${money(a.amountPaidCents, b.currency)} · falta ${money(a.priceCents - a.amountPaidCents, b.currency)}`
            : "Cobrar en el local",
      dueCents: paid === "PAID" ? 0 : Math.max(0, a.priceCents - a.amountPaidCents),
    };
  });

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
