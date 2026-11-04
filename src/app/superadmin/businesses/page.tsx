import Link from "next/link";
import type { SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-auth";
import { evaluate, fmtDate } from "@/lib/billing";
import { StatusBadge } from "@/components/StatusBadge";
import { extendTrial, toggleExempt } from "../actions";

const FILTERS: { key: string; label: string }[] = [
  { key: "", label: "Todas" },
  { key: "TRIAL", label: "En prueba" },
  { key: "ACTIVE", label: "Activas" },
  { key: "PAST_DUE", label: "Pago pendiente" },
  { key: "EXPIRED", label: "Vencidas" },
  { key: "CANCELED", label: "Canceladas" },
  { key: "EXEMPT", label: "Exentas" },
];

export default async function SuperBusinessesPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const q = sp.q?.trim().slice(0, 60);

  const businesses = await prisma.business.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { slug: { contains: q, mode: "insensitive" } },
            { creatorCode: { contains: q, mode: "insensitive" } },
            { admins: { some: { email: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : {},
    orderBy: { createdAt: "desc" },
    take: 300,
    select: {
      id: true, name: true, slug: true, billingExempt: true, createdAt: true, creatorCode: true,
      admins: { select: { email: true }, take: 1 },
      subscription: { include: { plan: true } },
    },
  });

  const now = new Date();
  const rows = businesses
    .map((b) => {
      const ev = b.subscription ? evaluate(b.subscription, now, b.billingExempt) : null;
      return { b, ev, status: (b.billingExempt ? "EXEMPT" : (ev?.status ?? "NONE")) as SubscriptionStatus | "EXEMPT" | "NONE" };
    })
    .filter((r) => !sp.status || r.status === sp.status);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Barberías ({rows.length})</h1>
        <form className="flex gap-2">
          {sp.status && <input type="hidden" name="status" value={sp.status} />}
          <input name="q" defaultValue={q} placeholder="Buscar nombre, email o código…" className="input !w-64 !py-1.5 !text-sm" />
          <button className="btn-ghost">Buscar</button>
        </form>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/superadmin/businesses?${new URLSearchParams({ ...(f.key ? { status: f.key } : {}), ...(q ? { q } : {}) })}`}
            className={`rounded-full border px-3 py-1 text-sm ${(sp.status ?? "") === f.key ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white hover:bg-neutral-100"}`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="card overflow-x-auto !p-0">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-xs text-neutral-500">
            <tr>
              <th className="px-3 py-2 font-medium">Barbería</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium">Plan</th>
              <th className="px-3 py-2 font-medium">Vence / próximo cobro</th>
              <th className="px-3 py-2 font-medium">Creador</th>
              <th className="px-3 py-2 font-medium">Alta</th>
              <th className="px-3 py-2 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map(({ b, ev }) => {
              const s = b.subscription;
              const authorized = s?.mpStatus === "authorized";
              return (
                <tr key={b.id} className="align-top">
                  <td className="px-3 py-2">
                    <a href={`/b/${b.slug}`} target="_blank" className="font-medium underline">
                      {b.name}
                    </a>
                    <div className="text-xs text-neutral-500">{b.admins[0]?.email ?? "—"}</div>
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={ev?.status} exempt={b.billingExempt} none={!s} />
                    {ev?.readonly && !b.billingExempt && <div className="mt-1 text-[11px] text-red-600">solo lectura</div>}
                  </td>
                  <td className="px-3 py-2">{s?.plan?.name ?? <span className="text-neutral-400">—</span>}</td>
                  <td className="px-3 py-2 text-xs">
                    {!s || b.billingExempt
                      ? "—"
                      : ev?.status === "TRIAL"
                        ? `Prueba hasta ${fmtDate(s.trialEndsAt)}`
                        : s.nextPaymentAt || s.currentPeriodEnd
                          ? fmtDate((s.nextPaymentAt ?? s.currentPeriodEnd)!)
                          : "—"}
                  </td>
                  <td className="px-3 py-2">{b.creatorCode ? <span className="font-mono text-xs">{b.creatorCode}</span> : <span className="text-neutral-400">—</span>}</td>
                  <td className="px-3 py-2 text-xs">{fmtDate(b.createdAt)}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {[7, 30].map((d) => (
                        <form key={d} action={extendTrial}>
                          <input type="hidden" name="businessId" value={b.id} />
                          <input type="hidden" name="days" value={d} />
                          <button
                            className="btn-ghost !px-2 !py-1 text-xs"
                            disabled={authorized}
                            title={authorized ? "Ya autorizó el cobro en Mercado Pago: la fecha la define Mercado Pago" : `Sumar ${d} días de prueba`}
                          >
                            +{d} d
                          </button>
                        </form>
                      ))}
                      <form action={toggleExempt}>
                        <input type="hidden" name="businessId" value={b.id} />
                        <button className="btn-ghost !px-2 !py-1 text-xs">{b.billingExempt ? "Quitar exención" : "Eximir"}</button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-neutral-500">
                  No hay barberías con ese filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
