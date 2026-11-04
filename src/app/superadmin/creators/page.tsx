import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-auth";
import { evaluate } from "@/lib/billing";
import { money } from "@/lib/format";
import { ActionForm } from "@/components/ActionForm";
import { CreatorFields } from "@/components/CreatorFields";
import { createCreator } from "../actions";

const BENEFIT = { TRACKING: "Seguimiento", COMMISSION: "Comisión", FREE_MONTHS: "Meses gratis" } as const;

export default async function SuperCreatorsPage() {
  await requireSuperAdmin();
  const [creators, earnings] = await Promise.all([
    prisma.creator.findMany({
      orderBy: { createdAt: "desc" },
      include: { businesses: { select: { billingExempt: true, subscription: { select: { status: true, trialEndsAt: true, currentPeriodEnd: true, mpStatus: true } } } } },
    }),
    prisma.creatorEarning.groupBy({ by: ["creatorId", "kind", "status"], _sum: { amountCents: true, months: true } }),
  ]);

  const now = new Date();
  const rows = creators.map((c) => {
    const counts = { TRIAL: 0, ACTIVE: 0, other: 0, none: 0 };
    for (const b of c.businesses) {
      if (!b.subscription) counts.none++;
      else {
        const s = evaluate(b.subscription, now, b.billingExempt).status;
        if (s === "TRIAL") counts.TRIAL++;
        else if (s === "ACTIVE") counts.ACTIVE++;
        else counts.other++;
      }
    }
    const mine = earnings.filter((e) => e.creatorId === c.id && e.status === "PENDING");
    return {
      c,
      counts,
      pendingCents: mine.filter((e) => e.kind === "COMMISSION").reduce((s, e) => s + (e._sum.amountCents ?? 0), 0),
      pendingMonths: mine.filter((e) => e.kind === "FREE_MONTHS").reduce((s, e) => s + (e._sum.months ?? 0), 0),
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Códigos de creador</h1>
        <p className="text-sm opacity-70">
          Cada creador comparte su link <span className="font-mono">/registro?ref=CODIGO</span> o su código. Acá ves cuántas barberías trajo y en qué estado están.
        </p>
      </div>

      <section className="card space-y-3">
        <h2 className="font-semibold">Nuevo código</h2>
        <ActionForm action={createCreator} submitLabel="Crear código" resetOnSuccess>
          <CreatorFields creating />
        </ActionForm>
      </section>

      <div className="card overflow-x-auto !p-0">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-xs text-neutral-500">
            <tr>
              <th className="px-3 py-2 font-medium">Código</th>
              <th className="px-3 py-2 font-medium">Creador</th>
              <th className="px-3 py-2 font-medium">Beneficio</th>
              <th className="px-3 py-2 text-right font-medium">Registros</th>
              <th className="px-3 py-2 text-right font-medium">En prueba</th>
              <th className="px-3 py-2 text-right font-medium">Pagando</th>
              <th className="px-3 py-2 text-right font-medium">Otras</th>
              <th className="px-3 py-2 font-medium">Pendiente de pagarle</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map(({ c, counts, pendingCents, pendingMonths }) => (
              <tr key={c.id} className={c.active ? "" : "opacity-60"}>
                <td className="px-3 py-2 font-mono font-semibold">
                  {c.code} {!c.active && <span className="ml-1 rounded-full bg-neutral-200 px-1.5 py-0.5 font-sans text-[10px]">inactivo</span>}
                </td>
                <td className="px-3 py-2">{c.name}</td>
                <td className="px-3 py-2 text-xs">
                  {BENEFIT[c.benefitType]}
                  {c.benefitType === "COMMISSION" && ` ${c.commissionPercent}%${c.commissionMonths ? ` x ${c.commissionMonths} m` : ""}`}
                  {c.benefitType === "FREE_MONTHS" && ` ${c.freeMonths} m`}
                </td>
                <td className="px-3 py-2 text-right text-lg font-bold tabular-nums">{c.businesses.length}</td>
                <td className="px-3 py-2 text-right tabular-nums">{counts.TRIAL}</td>
                <td className="px-3 py-2 text-right tabular-nums">{counts.ACTIVE}</td>
                <td className="px-3 py-2 text-right tabular-nums">{counts.other + counts.none}</td>
                <td className="px-3 py-2 text-xs">{pendingCents > 0 ? money(pendingCents, "ARS") : pendingMonths > 0 ? `${pendingMonths} meses` : "—"}</td>
                <td className="px-3 py-2 text-right">
                  <Link href={`/superadmin/creators/${c.id}`} className="btn-ghost !px-2 !py-1 text-xs">
                    Ver / editar
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-neutral-500">
                  Todavía no creaste ningún código.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
