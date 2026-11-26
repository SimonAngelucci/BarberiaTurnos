import { DateTime } from "luxon";

/**
 * Descuentos: lógica pura (sin base de datos) para poder probarla. El precio final SIEMPRE se calcula en el servidor con esto;
 * el navegador solo lo muestra.
 */
export type DiscountRule = {
  id: string;
  name: string;
  kind: "PERCENT" | "FIXED";
  /** Porcentaje (1-100) o monto fijo en centavos. */
  value: number;
  /** Vacío = todos los servicios. */
  serviceIds: string[];
  /** 0=domingo..6=sábado. Vacío = todos los días. */
  weekdays: number[];
  /** Franja horaria del turno, en minutos desde las 00:00 locales. null = todo el día. */
  startMin: number | null;
  endMin: number | null;
  /** Vigencia, comparada con la fecha del turno. null = sin límite. */
  startsAt: Date | null;
  endsAt: Date | null;
  active: boolean;
  couponCode: string | null;
  maxUses: number | null;
  usedCount: number;
};

export type CouponStatus = "none" | "ok" | "invalid" | "expired" | "exhausted" | "paused" | "not_applicable";

export type PriceResult = {
  originalCents: number;
  discountCents: number;
  finalCents: number;
  discount: DiscountRule | null;
  /** Estado del cupón que ingresó el cliente (none = no ingresó ninguno). */
  coupon: CouponStatus;
};

export const normalizeCoupon = (c: string | null | undefined) => (c ?? "").trim().toUpperCase().replace(/\s+/g, "");

/** Cuánto descuenta una regla sobre un precio. Nunca deja el precio por debajo de 0. */
export function discountAmount(rule: Pick<DiscountRule, "kind" | "value">, priceCents: number): number {
  const raw = rule.kind === "PERCENT" ? Math.round((priceCents * Math.min(100, Math.max(0, rule.value))) / 100) : rule.value;
  return Math.min(priceCents, Math.max(0, raw));
}

/** ¿Aplica esta regla a ese servicio en ese turno? (sin mirar el cupón ni los usos) */
export function ruleMatches(rule: DiscountRule, serviceId: string, startAt: Date, tz: string): boolean {
  if (rule.serviceIds.length > 0 && !rule.serviceIds.includes(serviceId)) return false;
  const local = DateTime.fromJSDate(startAt).setZone(tz);
  if (rule.startsAt && startAt < rule.startsAt) return false;
  if (rule.endsAt && startAt > rule.endsAt) return false;
  if (rule.weekdays.length > 0 && !rule.weekdays.includes(local.weekday % 7)) return false;
  const min = local.hour * 60 + local.minute;
  if (rule.startMin !== null && min < rule.startMin) return false;
  if (rule.endMin !== null && min >= rule.endMin) return false;
  return true;
}

/**
 * Precio final de un turno. Aplican las promociones automáticas (sin cupón) y, si el cliente ingresó un cupón válido, ese
 * también. No se acumulan: se aplica la que más descuenta.
 */
export function priceFor(p: { rules: DiscountRule[]; serviceId: string; priceCents: number; startAt: Date; tz: string; coupon?: string | null }): PriceResult {
  const code = normalizeCoupon(p.coupon);
  let coupon: CouponStatus = "none";
  const candidates: DiscountRule[] = [];

  for (const r of p.rules) {
    if (r.couponCode) continue;
    if (r.active && ruleMatches(r, p.serviceId, p.startAt, p.tz)) candidates.push(r);
  }

  if (code) {
    const r = p.rules.find((x) => x.couponCode === code);
    if (!r) coupon = "invalid";
    else if (!r.active) coupon = "paused";
    else if (r.maxUses !== null && r.usedCount >= r.maxUses) coupon = "exhausted";
    else if ((r.endsAt && p.startAt > r.endsAt) || (r.startsAt && p.startAt < r.startsAt)) coupon = "expired";
    else if (!ruleMatches(r, p.serviceId, p.startAt, p.tz)) coupon = "not_applicable";
    else {
      coupon = "ok";
      candidates.push(r);
    }
  }

  let best: DiscountRule | null = null;
  let bestCents = 0;
  for (const r of candidates) {
    const c = discountAmount(r, p.priceCents);
    if (c > bestCents) {
      best = r;
      bestCents = c;
    }
  }
  return { originalCents: p.priceCents, discountCents: bestCents, finalCents: p.priceCents - bestCents, discount: best, coupon };
}

/**
 * Promoción para mostrar en la LISTA de servicios (antes de elegir un horario): solo las automáticas que valen para cualquier
 * día y hora (sin días ni franja) y que están vigentes hoy. Las que dependen del día u horario se calculan al elegir el turno.
 */
export function servicePromo(rules: DiscountRule[], serviceId: string, priceCents: number, now: Date, fmtMoney: (cents: number) => string): { finalCents: number; badge: string } | null {
  let best: DiscountRule | null = null;
  let bestCents = 0;
  for (const r of rules) {
    if (!r.active || r.couponCode || r.weekdays.length > 0 || r.startMin !== null || r.endMin !== null) continue;
    if (r.serviceIds.length > 0 && !r.serviceIds.includes(serviceId)) continue;
    if ((r.startsAt && now < r.startsAt) || (r.endsAt && now > r.endsAt)) continue;
    const c = discountAmount(r, priceCents);
    if (c > bestCents) {
      best = r;
      bestCents = c;
    }
  }
  return best ? { finalCents: priceCents - bestCents, badge: discountBadge(best, fmtMoney) } : null;
}

/** «-20%» o «-$ 2.000» para la insignia. */
export function discountBadge(rule: Pick<DiscountRule, "kind" | "value">, fmtMoney: (cents: number) => string): string {
  return rule.kind === "PERCENT" ? `-${rule.value}%` : `-${fmtMoney(rule.value)}`;
}

/** Mensaje para el cliente según el estado del cupón. */
export const COUPON_MESSAGE: Record<CouponStatus, string> = {
  none: "",
  ok: "Cupón aplicado",
  invalid: "Ese cupón no existe.",
  expired: "Ese cupón está vencido o todavía no empezó.",
  exhausted: "Ese cupón ya se usó el máximo de veces.",
  paused: "Ese cupón no está disponible.",
  not_applicable: "Ese cupón no aplica a este servicio o a este horario.",
};

/** Mismo precio por regla serializable (de la base a JSON y de vuelta). */
export function toRule(d: {
  id: string; name: string; kind: "PERCENT" | "FIXED"; value: number; serviceIds: string[]; weekdays: number[]; startMin: number | null; endMin: number | null;
  startsAt: Date | null; endsAt: Date | null; active: boolean; couponCode: string | null; maxUses: number | null; usedCount: number;
}): DiscountRule {
  return { id: d.id, name: d.name, kind: d.kind, value: d.value, serviceIds: d.serviceIds, weekdays: d.weekdays, startMin: d.startMin, endMin: d.endMin, startsAt: d.startsAt, endsAt: d.endsAt, active: d.active, couponCode: d.couponCode, maxUses: d.maxUses, usedCount: d.usedCount };
}
