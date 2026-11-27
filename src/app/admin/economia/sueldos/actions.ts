"use server";

import { revalidatePath } from "next/cache";
import { DateTime } from "luxon";
import { z } from "zod";
import { prisma, getBusinessById } from "@/lib/db";
import { requireWritable } from "@/lib/guard";
import { addDays, biweeklyAnchor, computeSalary, firstPeriodStart } from "@/lib/salary";
import { loadSalaries } from "@/lib/salary-db";

const METHODS = ["Efectivo", "Transferencia", "Otro"] as const;

const ruleSchema = z.object({
  barberId: z.string().min(1),
  percent: z.coerce.number().min(0, "El porcentaje no puede ser negativo").max(100, "El porcentaje no puede pasar de 100"),
  base: z.coerce.number().min(0, "El monto fijo no puede ser negativo").max(100_000_000),
  frequency: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]),
  payDay: z.coerce.number().int().min(1).max(31),
});

/**
 * Guarda cómo se le paga a un profesional. Es versionado: el cambio rige desde el PERÍODO SIGUIENTE al que está en curso, así
 * nunca altera lo ya pagado ni lo que se está acumulando. Mientras todavía no se pagó ningún período, no hay nada cerrado y
 * se corrige directamente.
 */
export async function savePayRule(formData: FormData) {
  const { businessId } = await requireWritable();
  const d = ruleSchema.parse(Object.fromEntries(formData));
  const biz = await getBusinessById(businessId);
  if (d.frequency !== "MONTHLY" && d.payDay > 7) throw new Error("Día de pago inválido");

  const barber = await prisma.barber.findFirst({ where: { id: d.barberId, businessId }, select: { id: true } });
  if (!barber) throw new Error("Profesional inexistente");

  // Porcentaje por servicio: solo servicios de este negocio; vacío = usa el general.
  const services = await prisma.service.findMany({ where: { businessId }, select: { id: true } });
  const serviceRates: Record<string, number> = {};
  for (const s of services) {
    const raw = formData.get(`rate_${s.id}`)?.toString().trim();
    if (!raw) continue;
    const n = Number(raw.replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error("Porcentaje por servicio inválido");
    serviceRates[s.id] = Math.round(n * 100);
  }

  const now = new Date();
  const { today, list } = await loadSalaries(businessId, biz.timezone, now, barber.id);
  const cur = list[0];
  const base = {
    percentBp: Math.round(d.percent * 100),
    baseCents: Math.round(d.base * 100),
    serviceRates,
    frequency: d.frequency,
    payDay: d.payDay,
  };

  const hasPayments = cur.payments.length > 0;
  if (!cur.period || !hasPayments) {
    // Primera configuración (o corrección antes del primer pago): el primer período termina en el próximo día de pago.
    const anchorDate = d.frequency === "BIWEEKLY" ? biweeklyAnchor(today, d.payDay) : null;
    const effectiveFrom = firstPeriodStart(today, { frequency: d.frequency, payDay: d.payDay, anchorDate });
    await prisma.$transaction([
      prisma.payRule.deleteMany({ where: { barberId: barber.id } }),
      prisma.payRule.create({ data: { ...base, businessId, barberId: barber.id, effectiveFrom, anchorDate } }),
    ]);
  } else {
    const start = addDays(cur.period.end, 1);
    const prev = cur.period.rule;
    // Quincenal: se conserva el ritmo si no cambió; si no, el primer período nuevo dura entre 7 y 13 días.
    const anchorDate =
      d.frequency !== "BIWEEKLY" ? null : prev.frequency === "BIWEEKLY" && prev.payDay === d.payDay && prev.anchorDate ? prev.anchorDate : biweeklyAnchor(addDays(start, 6), d.payDay);
    await prisma.$transaction([
      prisma.payRule.deleteMany({ where: { barberId: barber.id, effectiveFrom: { gte: start } } }),
      prisma.payRule.create({ data: { ...base, businessId, barberId: barber.id, effectiveFrom: start, anchorDate } }),
    ]);
  }
  revalidatePath("/admin/economia/sueldos");
}

const paySchema = z.object({
  barberId: z.string().min(1),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  amount: z.coerce.number().min(0, "El monto no puede ser negativo").max(1_000_000_000),
  method: z.enum(METHODS),
  note: z.string().trim().max(200).optional(),
});

/** Cierra el período en curso de un profesional: guarda una foto de los números y abre el período siguiente. */
export async function markSalaryPaid(formData: FormData) {
  const { businessId } = await requireWritable();
  const d = paySchema.parse(Object.fromEntries(formData));
  const biz = await getBusinessById(businessId);
  const now = new Date();
  const { today, list } = await loadSalaries(businessId, biz.timezone, now, d.barberId);
  const cur = list[0];
  if (!cur || !cur.period) throw new Error("Este profesional no tiene sueldo configurado");
  // Se paga siempre el período que el servidor tiene en curso: evita pagar dos veces o uno ya cerrado.
  if (cur.period.start !== d.periodStart) throw new Error("El período cambió; actualizá la pantalla");
  if (d.paidDate > today) throw new Error("La fecha de pago no puede ser futura");

  // Se vuelve a calcular acá (no se confía en lo que mostró la pantalla).
  const appts = await prisma.appointment.findMany({
    where: { businessId, barberId: d.barberId, status: { in: ["CONFIRMED", "COMPLETED"] } },
    select: { id: true, startAt: true, endAt: true, status: true, priceCents: true, serviceId: true },
  });
  const calc = computeSalary({ rule: cur.period.rule, appts, from: cur.period.start, to: cur.period.end, tz: biz.timezone, now });
  const paidAt = DateTime.fromISO(d.paidDate, { zone: biz.timezone }).set({ hour: 12 }).toJSDate();
  try {
    await prisma.salaryPayment.create({
      data: {
        businessId,
        barberId: d.barberId,
        barberName: cur.barber.name,
        periodStart: cur.period.start,
        periodEnd: cur.period.end,
        turnCount: calc.count,
        billedCents: calc.billedCents,
        percentBp: cur.period.rule.percentBp,
        baseCents: cur.period.rule.baseCents,
        computedCents: calc.totalCents,
        paidCents: Math.round(d.amount * 100),
        method: d.method,
        note: d.note || null,
        paidAt,
      },
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new Error("Ese período ya está pagado");
    throw e;
  }
  revalidatePath("/admin/economia/sueldos");
}

/** Deshace el ÚLTIMO pago de un profesional (por si se marcó por error): el período vuelve a quedar en curso. */
export async function undoSalaryPayment(formData: FormData) {
  const { businessId } = await requireWritable();
  const id = z.string().min(1).parse(formData.get("id"));
  const pay = await prisma.salaryPayment.findFirst({ where: { id, businessId }, select: { id: true, barberId: true, periodStart: true } });
  if (!pay) throw new Error("Pago inexistente");
  const later = await prisma.salaryPayment.count({ where: { businessId, barberId: pay.barberId, periodStart: { gt: pay.periodStart } } });
  if (later > 0) throw new Error("Solo se puede deshacer el último pago");
  await prisma.salaryPayment.delete({ where: { id } });
  revalidatePath("/admin/economia/sueldos");
}
