import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-auth";
import { evaluate, fmtDate } from "@/lib/billing";
import { money } from "@/lib/format";
import { ActionForm } from "@/components/ActionForm";
import { CopyLink } from "@/components/CopyLink";
import { CreatorFields } from "@/components/CreatorFields";
import { StatusBadge } from "@/components/StatusBadge";
import { markEarningsPaid, updateCreator } from "../../actions";

const EARNING = { PENDING: ["Pendiente", "bg-amber-100 text-amber-800"], PAID: ["Pagado", "bg-green-100 text-green-800"], VOID: ["Anulado", "bg-neutral-200 text-neutral-600"] } as const;

export default async function SuperCreatorPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdmin();
  const { id } = await params;
  const creator = await prisma.creator.findUnique({
    where: { id },
    include: {
      businesses: {
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, slug: true, createdAt: true, billingExempt: true, subscription: { include: { plan: true } } },
      },
      earnings: { orderBy: { createdAt: "desc" }, take: 100 },
    },
  });
  if (!creator) notFound();

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  const now = new Date();
  const pending = creator.earnings.filter((e) => e.status === "PENDING");
  const paid = creator.earnings.filter((e) => e.status === "PAID");
  const sum = (list: typeof pending, k: "COMMISSION" | "FREE_MONTHS") => list.filter((e) => e.kind === k).reduce((s, e) => s + (k === "COMMISSION" ? e.amountCents : e.months), 0);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/superadmin/creators" className="text-sm underline opacity-80">
          ← Todos los creadores
        </Link>
        <h1 className="mt-1 text-xl font-bold">
          <span className="font-mono">{creator.code}</span> · {creator.name}
        </h1>
        <div className="mt-2">
          <div className="text-xs opacity-70">Link para compartir</div>
          <CopyLink url={`${proto}://${host}/registro?ref=${creator.code}`} />
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card">
          <div className="text-2xl font-extrabold">{creator.businesses.length}</div>
          <div className="text-sm text-neutral-600">Barberías registradas</div>
        </div>
        <div className="card">
          <div className="text-2xl font-extrabold">{creator.businesses.filter((b) => b.subscription && evaluate(b.subscription, now, b.billingExempt).status === "ACTIVE").length}</div>
          <div className="text-sm text-neutral-600">Pagando hoy</div>
        </div>
        <div className="card">
          <div className="text-2xl font-extrabold">{money(sum(pending, "COMMISSION"), "ARS")}</div>
          <div className="text-sm text-neutral-600">Comisión pendiente</div>
          {sum(pending, "FREE_MONTHS") > 0 && <div className="text-xs text-neutral-400">+ {sum(pending, "FREE_MONTHS")} meses gratis</div>}
        </div>
        <div className="card">
          <div className="text-2xl font-extrabold">{money(sum(paid, "COMMISSION"), "ARS")}</div>
          <div className="text-sm text-neutral-600">Comisión ya pagada</div>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Datos y beneficio</h2>
        <ActionForm action={updateCreator} submitLabel="Guardar">
          <input type="hidden" name="id" value={creator.id} />
          <CreatorFields c={creator} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={creator.active} /> Código activo (si lo desactivás, no se puede usar en registros nuevos; el historial se conserva)
          </label>
        </ActionForm>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Barberías que usaron este código</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs text-neutral-500">
              <tr>
                <th className="py-1 pr-3 font-medium">Barbería</th>
                <th className="py-1 pr-3 font-medium">Estado</th>
                <th className="py-1 pr-3 font-medium">Plan</th>
                <th className="py-1 font-medium">Alta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {creator.businesses.map((b) => (
                <tr key={b.id}>
                  <td className="py-2 pr-3 font-medium">{b.name}</td>
                  <td className="py-2 pr-3">
                    <StatusBadge status={b.subscription ? evaluate(b.subscription, now, b.billingExempt).status : undefined} exempt={b.billingExempt} none={!b.subscription} />
                  </td>
                  <td className="py-2 pr-3">{b.subscription?.plan?.name ?? "—"}</td>
                  <td className="py-2 text-xs">{fmtDate(b.createdAt)}</td>
                </tr>
              ))}
              {creator.businesses.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-neutral-500">
                    Todavía nadie usó este código.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Movimientos a favor del creador</h2>
          {pending.length > 0 && (
            <form action={markEarningsPaid} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="creatorId" value={creator.id} />
              <input name="note" maxLength={200} placeholder="Nota (ej. transferencia del 05/11)" className="input !w-64 !py-1.5 !text-sm" />
              <button className="btn-ghost">Marcar pendientes como pagados</button>
            </form>
          )}
        </div>
        <p className="text-xs text-neutral-500">Se generan solos con cada cobro aprobado de una barbería suya. El pago al creador lo hacés vos por fuera y acá dejás constancia.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <tbody className="divide-y divide-neutral-100">
              {creator.earnings.map((e) => (
                <tr key={e.id}>
                  <td className="py-2 pr-3 text-xs">{fmtDate(e.createdAt)}</td>
                  <td className="py-2 pr-3">{e.businessName}</td>
                  <td className="py-2 pr-3 tabular-nums">{e.kind === "COMMISSION" ? `Comisión ${money(e.amountCents, "ARS")}` : `${e.months} ${e.months === 1 ? "mes gratis" : "meses gratis"}`}</td>
                  <td className="py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${EARNING[e.status][1]}`}>{EARNING[e.status][0]}</span>
                    {e.note && <span className="ml-2 text-xs text-neutral-400">{e.note}</span>}
                  </td>
                </tr>
              ))}
              {creator.earnings.length === 0 && (
                <tr>
                  <td className="py-4 text-center text-neutral-500">Sin movimientos todavía.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
