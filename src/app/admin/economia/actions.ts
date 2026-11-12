"use server";

import { revalidatePath } from "next/cache";
import { DateTime } from "luxon";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireWritable } from "@/lib/guard";

const incomeSchema = z.object({
  amount: z.coerce.number().positive("Poné un monto mayor a cero").max(100_000_000, "El monto es demasiado grande"),
  description: z.string().trim().min(1, "Escribí una descripción").max(100),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
});

/** Suma un ingreso manual (venta de productos, propinas, etc.) al día elegido; entra en los totales de Economía. */
export async function addManualIncome(formData: FormData) {
  const { businessId } = await requireWritable();
  const d = incomeSchema.parse(Object.fromEntries(formData));
  const biz = await prisma.business.findUnique({ where: { id: businessId }, select: { timezone: true } });
  const day = DateTime.fromISO(d.date, { zone: biz?.timezone ?? "UTC" });
  if (!day.isValid) throw new Error("Fecha inválida");
  await prisma.manualIncome.create({ data: { businessId, amountCents: Math.round(d.amount * 100), description: d.description, date: day.set({ hour: 12 }).toJSDate() } });
  revalidatePath("/admin/economia");
}

export async function deleteManualIncome(formData: FormData) {
  const { businessId } = await requireWritable();
  const id = z.string().min(1).parse(formData.get("id"));
  await prisma.manualIncome.deleteMany({ where: { id, businessId } });
  revalidatePath("/admin/economia");
}
