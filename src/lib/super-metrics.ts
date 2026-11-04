import { prisma } from "./db";
import { evaluate } from "./billing";

/** Resumen de la plataforma. Los estados se calculan con la misma regla que el acceso real (evaluate). */
export async function loadOverview() {
  const now = new Date();
  const [subs, totalBusinesses, new7, new30, withCreator] = await Promise.all([
    prisma.subscription.findMany({ include: { plan: true, business: { select: { billingExempt: true } } } }),
    prisma.business.count(),
    prisma.business.count({ where: { createdAt: { gte: new Date(now.getTime() - 7 * 86_400_000) } } }),
    prisma.business.count({ where: { createdAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } } }),
    prisma.business.count({ where: { creatorId: { not: null } } }),
  ]);

  const c = { TRIAL: 0, ACTIVE: 0, PAST_DUE: 0, CANCELED: 0, EXPIRED: 0, exempt: 0 };
  let mrrCents = 0;
  let endingSoon = 0;
  for (const s of subs) {
    if (s.business.billingExempt) {
      c.exempt++;
      continue;
    }
    const ev = evaluate(s, now);
    c[ev.status]++;
    if (ev.status === "ACTIVE" && s.plan) mrrCents += s.plan.priceCents;
    if (ev.status === "TRIAL" && !ev.awaitingCharge && (ev.trialDaysLeft ?? 99) <= 7) endingSoon++;
  }
  const paying = c.ACTIVE;
  const decided = c.ACTIVE + c.PAST_DUE + c.CANCELED + c.EXPIRED;
  return {
    totalBusinesses,
    notStarted: Math.max(0, totalBusinesses - subs.length), // barberías anteriores a los cobros: su prueba arranca cuando ingresan
    counts: c,
    mrrCents,
    endingSoon,
    new7,
    new30,
    withCreator,
    conversion: decided > 0 ? Math.round((paying / decided) * 100) : null,
  };
}
