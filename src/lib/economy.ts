import { DateTime } from "luxon";

// Cálculos de Economía: funciones puras (sin base de datos) para poder probarlas solas.

export type EcoAppt = { startAt: Date; endAt: Date; status: string; priceCents: number; serviceId: string };
export type EcoManual = { date: Date; amountCents: number };

/**
 * Un turno cuenta como ingreso cuando ya se hizo: lo marcaste como completado, o estaba confirmado y su horario ya terminó
 * (si no lo marcás a mano, se da por hecho). Cancelados, ausentes y sin pagar no suman.
 */
export function isDone(a: Pick<EcoAppt, "status" | "endAt">, now: Date) {
  return a.status === "COMPLETED" || (a.status === "CONFIRMED" && a.endAt.getTime() <= now.getTime());
}

export type Period = {
  label: string;
  from: DateTime;
  /** Exclusivo. */
  to: DateTime;
  turnosCents: number;
  manualCents: number;
  totalCents: number;
  count: number;
};

function period(label: string, from: DateTime, to: DateTime, appts: EcoAppt[], manual: EcoManual[], now: Date): Period {
  const f = from.toMillis();
  const t = to.toMillis();
  const done = appts.filter((a) => isDone(a, now) && a.startAt.getTime() >= f && a.startAt.getTime() < t);
  const turnosCents = done.reduce((s, a) => s + a.priceCents, 0);
  const manualCents = manual.filter((m) => m.date.getTime() >= f && m.date.getTime() < t).reduce((s, m) => s + m.amountCents, 0);
  return { label, from, to, turnosCents, manualCents, totalCents: turnosCents + manualCents, count: done.length };
}

/** Variación porcentual contra el período anterior (null si antes no había nada con qué comparar). */
export function change(cur: number, prev: number): number | null {
  if (prev <= 0) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

export function summarize(p: { appts: EcoAppt[]; manual: EcoManual[]; now: Date; tz: string; serviceNames: Map<string, string> }) {
  const { appts, manual, now, tz } = p;
  const n = DateTime.fromJSDate(now).setZone(tz).setLocale("es");
  const weekStart = n.startOf("week"); // lunes
  const monthStart = n.startOf("month");

  const week = period("Esta semana", weekStart, weekStart.plus({ weeks: 1 }), appts, manual, now);
  const prevWeek = period("Semana anterior", weekStart.minus({ weeks: 1 }), weekStart, appts, manual, now);
  const month = period("Este mes", monthStart, monthStart.plus({ months: 1 }), appts, manual, now);
  const prevMonth = period("Mes anterior", monthStart.minus({ months: 1 }), monthStart, appts, manual, now);

  // Turnos agendados que todavía no se hicieron (este mes): plata que se espera, aún no sumada.
  const mf = monthStart.toMillis();
  const mt = monthStart.plus({ months: 1 }).toMillis();
  const pending = appts.filter((a) => a.status === "CONFIRMED" && a.endAt.getTime() > now.getTime() && a.startAt.getTime() >= mf && a.startAt.getTime() < mt);
  const pendingCents = pending.reduce((s, a) => s + a.priceCents, 0);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = weekStart.plus({ days: i });
    const per = period(d.toFormat("ccc d"), d, d.plus({ days: 1 }), appts, manual, now);
    return { ...per, today: d.hasSame(n, "day") };
  });
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const s = weekStart.minus({ weeks: 7 - i });
    return period(`${s.toFormat("d LLL")}`, s, s.plus({ weeks: 1 }), appts, manual, now);
  });
  const months = Array.from({ length: 6 }, (_, i) => {
    const s = monthStart.minus({ months: 5 - i });
    return period(s.toFormat("LLLL yyyy"), s, s.plus({ months: 1 }), appts, manual, now);
  });

  // Servicios que más ingresos dejaron este mes.
  const byService = new Map<string, { cents: number; count: number }>();
  for (const a of appts) {
    if (!isDone(a, now) || a.startAt.getTime() < mf || a.startAt.getTime() >= mt) continue;
    const cur = byService.get(a.serviceId) ?? { cents: 0, count: 0 };
    byService.set(a.serviceId, { cents: cur.cents + a.priceCents, count: cur.count + 1 });
  }
  const topServices = [...byService.entries()]
    .map(([id, v]) => ({ name: p.serviceNames.get(id) ?? "Servicio eliminado", ...v }))
    .sort((a, b) => b.cents - a.cents)
    .slice(0, 5);

  return { week, prevWeek, month, prevMonth, pendingCents, pendingCount: pending.length, days, weeks, months, topServices };
}
