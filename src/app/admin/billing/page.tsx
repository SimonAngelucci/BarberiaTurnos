import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { STATUS_LABEL, fmtDate, getAccess } from "@/lib/billing";
import { billingConfigured, syncSubscriptionNow } from "@/lib/mp-subscriptions";
import { BillingPanel } from "@/components/BillingPanel";

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ mp?: string }> }) {
  const { businessId, adminId } = await requireAdmin();
  const sp = await searchParams;
  // Al volver de Mercado Pago (o con «Actualizar estado») se sincroniza ya, sin esperar el aviso del webhook.
  if (sp.mp === "return") await syncSubscriptionNow(businessId);

  const [access, plans, admin] = await Promise.all([
    getAccess(businessId),
    prisma.plan.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { priceCents: "asc" }] }),
    prisma.adminUser.findUnique({ where: { id: adminId }, select: { email: true } }),
  ]);
  const payments = await prisma.subscriptionPayment.findMany({ where: { businessId }, orderBy: { createdAt: "desc" }, take: 24 });
  const { sub } = access;
  const hasMp = !!sub.mpPreapprovalId && sub.mpStatus !== "cancelled";

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Suscripción</h1>
      <BillingPanel
        configured={billingConfigured()}
        exempt={access.exempt}
        statusLabel={STATUS_LABEL[access.status]}
        status={access.status}
        readonly={access.readonly}
        awaitingCharge={access.awaitingCharge}
        trialDaysLeft={access.trialDaysLeft}
        trialEnds={fmtDate(sub.trialEndsAt)}
        nextCharge={sub.nextPaymentAt ?? sub.currentPeriodEnd ? fmtDate((sub.nextPaymentAt ?? sub.currentPeriodEnd)!) : null}
        accessUntil={access.accessUntil ? fmtDate(access.accessUntil) : null}
        mpStatus={sub.mpStatus}
        initPoint={sub.mpInitPoint}
        currentPlanId={sub.planId}
        canCancel={hasMp && access.status !== "CANCELED"}
        defaultEmail={sub.payerEmail ?? admin?.email ?? ""}
        plans={plans.map((p) => ({ id: p.id, name: p.name, description: p.description, priceCents: p.priceCents, currency: p.currency, maxBarbers: p.maxBarbers, features: p.features }))}
        payments={payments.map((p) => ({ id: p.id, date: fmtDate(p.paidAt ?? p.createdAt), amountCents: p.amountCents, currency: p.currency, status: p.status, detail: p.detail }))}
      />
    </div>
  );
}
