import Link from "next/link";
import { headers } from "next/headers";
import { prisma, getBusinessById } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { themeCss, money } from "@/lib/format";
import { CopyLink } from "@/components/CopyLink";
import { NotificationBell } from "@/components/NotificationBell";
import { TurnosBoard, type BoardAppt } from "@/components/TurnosBoard";

export const dynamic = "force-dynamic";

/** Vista de Turnos con link propio (/admin/turnos): solo los próximos turnos, con color de alerta según la cercanía. */
export default async function TurnosPage() {
  const { businessId } = await requireAdmin();
  const b = await getBusinessById(businessId);
  const now = new Date();

  const rows = await prisma.appointment.findMany({
    where: { businessId, status: "CONFIRMED", endAt: { gt: now }, startAt: { lt: new Date(now.getTime() + 7 * 86400_000) } },
    orderBy: { startAt: "asc" },
    include: { customer: true, service: true, barber: true },
  });

  const appts: BoardAppt[] = rows.map((a) => ({
    id: a.id,
    startAt: a.startAt.toISOString(),
    endAt: a.endAt.toISOString(),
    customer: `${a.customer.firstName} ${a.customer.lastName}`,
    phone: a.customer.phone,
    service: a.service.name,
    barber: a.barber?.name ?? null,
    paid: a.paymentStatus === "PAID" ? "PAID" : a.paymentStatus === "DEPOSIT_PAID" ? "DEPOSIT" : a.paymentStatus === "PENDING_AT_STORE" ? "STORE" : "NONE",
    paidLabel:
      a.paymentStatus === "PAID"
        ? "Pagado"
        : a.paymentStatus === "DEPOSIT_PAID"
          ? `Seña ${money(a.amountPaidCents, b.currency)} · falta ${money(a.priceCents - a.amountPaidCents, b.currency)}`
          : "Cobrar en el local",
  }));

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  return (
    <div className="space-y-4">
      <style dangerouslySetInnerHTML={{ __html: themeCss(b.primaryColor, "#f4f4f5") }} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {b.logoUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={b.logoUrl} alt="" className="h-10 w-10 rounded-full object-cover" />}
          <div>
            <h1 className="text-xl font-extrabold leading-tight">Turnos · {b.name}</h1>
            <Link href="/admin" className="text-xs underline">
              ← Volver al panel
            </Link>
          </div>
        </div>
        <NotificationBell />
      </div>
      <TurnosBoard appts={appts} tz={b.timezone} />
      <div className="card !py-2">
        <div className="text-xs text-neutral-500">Link directo a esta vista (te pide ingresar con tu cuenta)</div>
        <CopyLink url={`${proto}://${host}/admin/turnos`} />
      </div>
    </div>
  );
}
