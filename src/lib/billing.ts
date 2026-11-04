import { DateTime } from "luxon";
import { Prisma, type Plan, type Subscription, type SubscriptionStatus } from "@prisma/client";
import { prisma } from "./db";

/** Mes de prueba gratis de toda barbería nueva. */
export const TRIAL_MONTHS = 1;
/**
 * Tolerancia, en días, antes de limitar el acceso cuando el cobro está "en camino" pero todavía no llegó la
 * confirmación (suscripción autorizada cuyo primer cobro aún no se registró, o renovación demorada).
 */
export const GRACE_DAYS = 3;
const DAY = 86_400_000;

export const newTrialEnd = (from = new Date()) => DateTime.fromJSDate(from).plus({ months: TRIAL_MONTHS }).toJSDate();

type SubLike = Pick<Subscription, "status" | "trialEndsAt" | "currentPeriodEnd" | "mpStatus">;

export type Evaluation = {
  /** Estado real ahora (puede diferir del guardado si venció algo y todavía no corrió el proceso periódico). */
  status: SubscriptionStatus;
  /** true = la cuenta queda en modo solo lectura y no acepta reservas nuevas. */
  readonly: boolean;
  /** La prueba terminó pero el primer cobro de una suscripción ya autorizada aún no se confirmó. */
  awaitingCharge: boolean;
  /** Hasta cuándo conserva el acceso completo (si corresponde). */
  accessUntil: Date | null;
  /** Días enteros que quedan de prueba (solo en TRIAL vigente). */
  trialDaysLeft: number | null;
};

/**
 * Regla única de acceso. Función pura: no toca la base ni el reloj (recibe `now`), así se puede probar entera.
 *
 *  TRIAL     → completo hasta `trialEndsAt`. Si ya autorizó una suscripción, el primer cobro ocurre ese día:
 *              se tolera GRACE_DAYS esperando la confirmación y después pasa a PAST_DUE. Sin suscripción → EXPIRED.
 *  ACTIVE    → completo mientras el período pagado (+ tolerancia) esté vigente; si no, PAST_DUE.
 *  PAST_DUE  → solo lectura (el cobro falló).
 *  CANCELED  → completo hasta el fin de lo ya pagado/de la prueba; después, solo lectura.
 *  EXPIRED   → solo lectura (la prueba terminó sin contratar un plan).
 *  Cuenta exenta → siempre completo.
 */
export function evaluate(sub: SubLike, now = new Date(), exempt = false): Evaluation {
  const t = now.getTime();
  const trialEnd = sub.trialEndsAt.getTime();
  const periodEnd = sub.currentPeriodEnd?.getTime() ?? null;
  const grace = GRACE_DAYS * DAY;
  const out = (status: SubscriptionStatus, readonly: boolean, extra: Partial<Evaluation> = {}): Evaluation => ({
    status,
    readonly,
    awaitingCharge: false,
    accessUntil: null,
    trialDaysLeft: null,
    ...extra,
  });

  if (exempt) return out(sub.status, false);

  switch (sub.status) {
    case "TRIAL":
      if (t <= trialEnd) return out("TRIAL", false, { accessUntil: sub.trialEndsAt, trialDaysLeft: Math.max(0, Math.ceil((trialEnd - t) / DAY)) });
      if (sub.mpStatus === "authorized") {
        return t <= trialEnd + grace
          ? out("TRIAL", false, { awaitingCharge: true, accessUntil: new Date(trialEnd + grace), trialDaysLeft: 0 })
          : out("PAST_DUE", true);
      }
      return out("EXPIRED", true);
    case "ACTIVE": {
      const until = periodEnd === null ? null : periodEnd + grace;
      return until !== null && t <= until ? out("ACTIVE", false, { accessUntil: new Date(periodEnd!) }) : out("PAST_DUE", true);
    }
    case "CANCELED": {
      const until = Math.max(trialEnd, periodEnd ?? 0);
      return t <= until ? out("CANCELED", false, { accessUntil: new Date(until) }) : out("CANCELED", true);
    }
    case "PAST_DUE":
      return out("PAST_DUE", true);
    case "EXPIRED":
      return out("EXPIRED", true);
  }
}

export const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  TRIAL: "En prueba",
  ACTIVE: "Activa",
  PAST_DUE: "Pago pendiente",
  CANCELED: "Cancelada",
  EXPIRED: "Vencida",
};

export type Access = Evaluation & {
  exempt: boolean;
  sub: Subscription & { plan: Plan | null };
  /** ¿Puede aceptar reservas nuevas? */
  bookable: boolean;
  /** Tope de barberos vigente (null = sin tope). Durante la prueba no hay tope. */
  barberLimit: number | null;
};

/** Barbería sin suscripción (creadas antes de existir los cobros): arrancan su mes de prueba la primera vez que se las consulta. */
async function ensureSubscription(businessId: string) {
  try {
    return await prisma.subscription.create({ data: { businessId, trialEndsAt: newTrialEnd() }, include: { plan: true, business: { select: { billingExempt: true } } } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return prisma.subscription.findUnique({ where: { businessId }, include: { plan: true, business: { select: { billingExempt: true } } } });
    }
    throw e;
  }
}

/** Acceso actual de una barbería. Una consulta (más una sola vez, la creación si faltaba). */
export async function getAccess(businessId: string): Promise<Access> {
  let sub = await prisma.subscription.findUnique({ where: { businessId }, include: { plan: true, business: { select: { billingExempt: true } } } });
  if (!sub) {
    const exists = await prisma.business.count({ where: { id: businessId } });
    if (!exists) throw new Error("Barbería inexistente");
    sub = await ensureSubscription(businessId);
  }
  if (!sub) throw new Error("No se pudo cargar la suscripción");
  const exempt = sub.business.billingExempt;
  const ev = evaluate(sub, new Date(), exempt);
  const { business: _business, ...clean } = sub;
  void _business;
  return {
    ...ev,
    exempt,
    sub: clean,
    bookable: !ev.readonly,
    barberLimit: exempt || ev.status === "TRIAL" ? null : (sub.plan?.maxBarbers ?? null),
  };
}

/** Pasa a la base los vencimientos que ya ocurrieron (TRIAL→EXPIRED/PAST_DUE, ACTIVE→PAST_DUE). Lo corre el cron. */
export async function syncSubscriptionStates(limit = 200) {
  const now = new Date();
  const due = await prisma.subscription.findMany({
    where: { OR: [{ status: "TRIAL", trialEndsAt: { lt: now } }, { status: "ACTIVE", currentPeriodEnd: { lt: now } }] },
    include: { business: { select: { billingExempt: true } } },
    take: limit,
  });
  let changed = 0;
  for (const s of due) {
    const ev = evaluate(s, now, s.business.billingExempt);
    if (s.business.billingExempt || ev.status === s.status) continue;
    await prisma.subscription.update({
      where: { id: s.id },
      data: { status: ev.status, ...(ev.status === "PAST_DUE" && !s.pastDueSince ? { pastDueSince: now } : {}) },
    });
    changed++;
  }
  return changed;
}

/**
 * Suma días de prueba (acción del Super Admin). Devuelve false si no corresponde:
 * - cuenta que ya paga (ACTIVE) o con el cobro fallido (PAST_DUE): la prueba no aplica;
 * - suscripción ya autorizada en Mercado Pago: el primer cobro lo tiene programado Mercado Pago y alargar la
 *   prueba solo en nuestra base no lo movería (la barbería quedaría con acceso pero igual la cobrarían antes).
 */
export async function extendTrialFor(businessId: string, days: number): Promise<boolean> {
  const { sub } = await getAccess(businessId); // crea la suscripción si faltaba
  if (sub.mpStatus === "authorized" || sub.status === "ACTIVE" || sub.status === "PAST_DUE") return false;
  const base = Math.max(sub.trialEndsAt.getTime(), Date.now());
  await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      trialEndsAt: new Date(base + days * 86_400_000),
      // Una cuenta vencida vuelve a estar en prueba; una cancelada conserva su estado (y lo ya pagado).
      ...(sub.status === "EXPIRED" || sub.status === "TRIAL" ? { status: "TRIAL" as const } : {}),
    },
  });
  return true;
}

export const fmtDate = (d: Date, tz = "America/Argentina/Buenos_Aires") => DateTime.fromJSDate(d).setZone(tz).setLocale("es").toFormat("d 'de' LLLL yyyy");
