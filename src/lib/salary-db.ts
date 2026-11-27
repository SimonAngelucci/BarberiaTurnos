import { DateTime } from "luxon";
import { prisma } from "./db";
import { computeSalary, currentPeriod, parseRates, periodState, type Period, type PeriodState, type Rule, type SalaryCalc } from "./salary";

export type BarberSalary = {
  barber: { id: string; name: string; color: string | null; active: boolean };
  rules: Rule[];
  /** null = todavía sin configurar. */
  period: Period | null;
  calc: SalaryCalc | null;
  state: PeriodState | null;
  /** Cambio de regla ya programado para un período futuro. */
  scheduled: Rule | null;
  payments: {
    id: string;
    periodStart: string;
    periodEnd: string;
    turnCount: number;
    billedCents: number;
    percentBp: number;
    baseCents: number;
    computedCents: number;
    paidCents: number;
    method: string;
    note: string | null;
    paidAt: Date;
  }[];
};

export function toRule(r: { effectiveFrom: string; percentBp: number; baseCents: number; serviceRates: unknown; frequency: Rule["frequency"]; payDay: number; anchorDate: string | null }): Rule {
  return { effectiveFrom: r.effectiveFrom, percentBp: r.percentBp, baseCents: r.baseCents, serviceRates: parseRates(r.serviceRates), frequency: r.frequency, payDay: r.payDay, anchorDate: r.anchorDate };
}

/** Estado de sueldos de cada profesional del negocio (o de uno solo): regla, período en curso, cálculo e historial de pagos. */
export async function loadSalaries(businessId: string, tz: string, now: Date, onlyBarberId?: string): Promise<{ today: string; list: BarberSalary[] }> {
  const today = DateTime.fromJSDate(now).setZone(tz).toISODate() as string;
  const barbers = await prisma.barber.findMany({
    where: { businessId, ...(onlyBarberId ? { id: onlyBarberId } : {}) },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: { id: true, name: true, color: true, active: true },
  });
  const ids = barbers.map((b) => b.id);
  const [rules, payments] = await Promise.all([
    prisma.payRule.findMany({ where: { businessId, barberId: { in: ids } }, orderBy: { effectiveFrom: "asc" } }),
    prisma.salaryPayment.findMany({ where: { businessId, barberId: { in: ids } }, orderBy: { periodStart: "desc" } }),
  ]);

  const partial = barbers.map((b) => {
    const rs = rules.filter((r) => r.barberId === b.id).map(toRule);
    const pays = payments.filter((p) => p.barberId === b.id);
    const paidThrough = pays.reduce<string | null>((m, p) => (m === null || p.periodEnd > m ? p.periodEnd : m), null);
    return { b, rs, pays, period: currentPeriod(rs, paidThrough) };
  });

  // Turnos de todos los períodos en curso en una sola consulta.
  const starts = partial.filter((x) => x.period).map((x) => x.period!.start).sort();
  const appts = starts.length
    ? await prisma.appointment.findMany({
        where: {
          businessId,
          barberId: { in: partial.filter((x) => x.period).map((x) => x.b.id) },
          startAt: { gte: DateTime.fromISO(starts[0], { zone: tz }).startOf("day").toJSDate(), lte: now },
          status: { in: ["CONFIRMED", "COMPLETED"] },
        },
        select: { id: true, barberId: true, startAt: true, endAt: true, status: true, priceCents: true, serviceId: true },
      })
    : [];

  const list: BarberSalary[] = partial.map(({ b, rs, pays, period }) => {
    const calc = period ? computeSalary({ rule: period.rule, appts: appts.filter((a) => a.barberId === b.id), from: period.start, to: period.end, tz, now }) : null;
    return {
      barber: b,
      rules: rs,
      period,
      calc,
      state: period ? periodState(period.start, period.end, today) : null,
      scheduled: period ? (rs.find((r) => r.effectiveFrom > period.start) ?? null) : null,
      payments: pays.map((p) => ({ ...p })),
    };
  });
  return { today, list };
}
