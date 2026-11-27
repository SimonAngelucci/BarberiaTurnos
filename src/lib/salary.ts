import { DateTime } from "luxon";
import { isDone } from "./economy";

// Sueldos de profesionales: funciones puras (sin base de datos) para poder probarlas solas.
// Todas las fechas son días locales del negocio en formato "yyyy-MM-dd": se comparan como texto y las cuentas de días
// se hacen en UTC, así el huso horario nunca corre un día.

export type Freq = "WEEKLY" | "BIWEEKLY" | "MONTHLY";

export type Rule = {
  /** Primer día del primer período en que rige esta regla. */
  effectiveFrom: string;
  /** Porcentaje en centésimas de punto: 4500 = 45 %. */
  percentBp: number;
  baseCents: number;
  /** Porcentaje propio por servicio (mismas unidades que percentBp). */
  serviceRates: Record<string, number>;
  frequency: Freq;
  /** Semanal/quincenal: 1 = lunes … 7 = domingo. Mensual: día del mes (31 = último día). */
  payDay: number;
  anchorDate: string | null;
};

export type SalaryAppt = { id: string; startAt: Date; endAt: Date; status: string; priceCents: number; serviceId: string };

const day = (s: string) => DateTime.fromISO(s, { zone: "utc" });
const iso = (d: DateTime) => d.toISODate() as string;

export const addDays = (s: string, n: number) => iso(day(s).plus({ days: n }));
/** a − b en días. */
export const diffDays = (a: string, b: string) => Math.round(day(a).diff(day(b), "days").days);

/** Día de pago de un mes (31 = último día; si el mes es más corto, el último). */
function monthPayDate(month: DateTime, payDay: number) {
  return month.set({ day: Math.min(payDay, month.daysInMonth ?? 28) });
}

type Sched = Pick<Rule, "frequency" | "payDay" | "anchorDate">;

/** Primer día de pago que cae en `from` o después. */
export function nextPayDate(from: string, r: Sched): string {
  const f = day(from);
  if (r.frequency === "WEEKLY") return iso(f.plus({ days: (r.payDay - f.weekday + 7) % 7 }));
  if (r.frequency === "BIWEEKLY") {
    const off = (((diffDays(from, r.anchorDate ?? from) % 14) + 14) % 14);
    return addDays(from, (14 - off) % 14);
  }
  for (let i = 0; i < 3; i++) {
    const c = monthPayDate(f.startOf("month").plus({ months: i }), r.payDay);
    if (iso(c) >= from) return iso(c);
  }
  return from;
}

/** Último día de pago que cae en `to` o antes. */
export function lastPayDate(to: string, r: Sched): string {
  const t = day(to);
  if (r.frequency === "WEEKLY") return iso(t.minus({ days: (t.weekday - r.payDay + 7) % 7 }));
  if (r.frequency === "BIWEEKLY") {
    const off = (((diffDays(to, r.anchorDate ?? to) % 14) + 14) % 14);
    return addDays(to, -off);
  }
  for (let i = 0; i < 3; i++) {
    const c = monthPayDate(t.startOf("month").minus({ months: i }), r.payDay);
    if (iso(c) <= to) return iso(c);
  }
  return to;
}

/** Día de referencia para pagar cada 14 días: el primer día de la semana elegido a partir de `from`. */
export function biweeklyAnchor(from: string, payDay: number) {
  return nextPayDate(from, { frequency: "WEEKLY", payDay, anchorDate: null });
}

/** Primer día del período en curso para una regla recién creada hoy: el día después del último pago programado. */
export function firstPeriodStart(today: string, r: Sched) {
  return addDays(lastPayDate(addDays(today, -1), r), 1);
}

/** La regla que rige para un período que empieza en `start` (la última cuya vigencia ya empezó). */
export function ruleFor(rules: Rule[], start: string): Rule | null {
  if (rules.length === 0) return null;
  const sorted = [...rules].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1));
  let pick = sorted[0];
  for (const r of sorted) if (r.effectiveFrom <= start) pick = r;
  return pick;
}

export type Period = { start: string; end: string; rule: Rule };

/**
 * Período en curso de un profesional: el primero que todavía no se pagó. Empieza el día siguiente al último pago (o donde
 * arranca la primera regla) y termina en el próximo día de pago. Usa la regla vigente al inicio del período, por eso un
 * cambio de porcentaje programado no toca el período en curso ni los ya pagados.
 */
export function currentPeriod(rules: Rule[], paidThrough: string | null): Period | null {
  if (rules.length === 0) return null;
  const sorted = [...rules].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1));
  const start = paidThrough ? addDays(paidThrough, 1) : sorted[0].effectiveFrom;
  const rule = ruleFor(rules, start)!;
  return { start, end: nextPayDate(start, rule), rule };
}

export function rateFor(rule: Rule, serviceId: string) {
  return rule.serviceRates[serviceId] ?? rule.percentBp;
}

export type SalaryItem = { id: string; startAt: Date; serviceId: string; priceCents: number; rateBp: number; commissionCents: number };
export type SalaryCalc = { items: SalaryItem[]; count: number; billedCents: number; commissionCents: number; baseCents: number; totalCents: number };

/**
 * Cuánto corresponde pagar por un período: lo cobrado en los turnos realizados del profesional (precio FINAL, con descuentos)
 * por su porcentaje, más el monto fijo. Los cancelados y ausentes no cuentan; los confirmados cuentan cuando su horario ya terminó
 * (igual que en Economía).
 */
export function computeSalary(p: { rule: Rule; appts: SalaryAppt[]; from: string; to: string; tz: string; now: Date }): SalaryCalc {
  const f = DateTime.fromISO(p.from, { zone: p.tz }).startOf("day").toMillis();
  const t = DateTime.fromISO(p.to, { zone: p.tz }).plus({ days: 1 }).startOf("day").toMillis();
  const items = p.appts
    .filter((a) => isDone(a, p.now) && a.startAt.getTime() >= f && a.startAt.getTime() < t)
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
    .map((a) => {
      const rateBp = rateFor(p.rule, a.serviceId);
      return { id: a.id, startAt: a.startAt, serviceId: a.serviceId, priceCents: a.priceCents, rateBp, commissionCents: Math.round((a.priceCents * rateBp) / 10_000) };
    });
  const billedCents = items.reduce((s, i) => s + i.priceCents, 0);
  const commissionCents = items.reduce((s, i) => s + i.commissionCents, 0);
  return { items, count: items.length, billedCents, commissionCents, baseCents: p.rule.baseCents, totalCents: commissionCents + p.rule.baseCents };
}

export type PeriodState = { totalDays: number; elapsedDays: number; progress: number; daysLeft: number; overdue: boolean; soon: boolean };

/** Avance del período para el anillo y el aviso: «soon» = faltan 2 días o menos para cobrar (o es hoy). */
export function periodState(start: string, end: string, today: string): PeriodState {
  const totalDays = diffDays(end, start) + 1;
  const elapsedDays = Math.min(totalDays, Math.max(0, diffDays(today, start) + 1));
  const daysLeft = diffDays(end, today);
  return { totalDays, elapsedDays, progress: totalDays > 0 ? elapsedDays / totalDays : 0, daysLeft, overdue: daysLeft < 0, soon: daysLeft >= 0 && daysLeft <= 2 };
}

/** «faltan 3 días», «mañana», «hoy», «atrasado 2 días». */
export function leftText(daysLeft: number) {
  if (daysLeft < 0) return `atrasado ${-daysLeft} ${daysLeft === -1 ? "día" : "días"}`;
  if (daysLeft === 0) return "hoy";
  if (daysLeft === 1) return "mañana";
  return `faltan ${daysLeft} días`;
}

export function percentLabel(bp: number) {
  return `${(bp / 100).toLocaleString("es-AR", { maximumFractionDigits: 2 })}%`;
}

/** Texto de la frecuencia: «Semanal · sábados», «Mensual · día 30». */
export function scheduleLabel(r: Pick<Rule, "frequency" | "payDay">) {
  const wd = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados", "domingos"][r.payDay];
  if (r.frequency === "WEEKLY") return `Semanal · ${wd}`;
  if (r.frequency === "BIWEEKLY") return `Quincenal · ${wd}`;
  return r.payDay >= 31 ? "Mensual · último día del mes" : `Mensual · día ${r.payDay}`;
}

/** Lee el JSON de porcentajes por servicio de forma segura. */
export function parseRates(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (v && typeof v === "object" && !Array.isArray(v)) {
    for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
      if (typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 10_000) out[k] = Math.round(n);
    }
  }
  return out;
}
