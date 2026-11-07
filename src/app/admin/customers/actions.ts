"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireWritable } from "@/lib/guard";

/** Activa o desactiva el aprendizaje de tiempos. Apagado, todo vuelve a usar la duración normal de cada servicio. */
export async function saveLearnDurations(formData: FormData) {
  const { businessId } = await requireWritable();
  await prisma.business.update({ where: { id: businessId }, data: { learnDurations: formData.get("learnDurations") === "on" } });
  revalidatePath("/admin/customers");
  revalidatePath("/", "layout");
}

const target = z.object({ customerId: z.string().min(1), serviceId: z.string().min(1) });

/** Verifica que el cliente y el servicio sean de este negocio (las actions son endpoints públicos). */
async function ownTarget(businessId: string, formData: FormData) {
  const t = target.parse(Object.fromEntries(formData));
  const [c, s] = await Promise.all([
    prisma.customer.findFirst({ where: { id: t.customerId, businessId }, select: { id: true } }),
    prisma.service.findFirst({ where: { id: t.serviceId, businessId }, select: { id: true } }),
  ]);
  if (!c || !s) throw new Error("No encontrado");
  return t;
}

/** Fija a mano el tiempo de un cliente para un servicio (tiene prioridad sobre lo aprendido). */
export async function setCustomerTime(formData: FormData) {
  const { businessId } = await requireWritable();
  const t = await ownTarget(businessId, formData);
  const minutes = z.coerce.number().int().min(5).max(480).parse(formData.get("minutes"));
  await prisma.customerServiceTime.upsert({
    where: { customerId_serviceId: t },
    create: { businessId, ...t, overrideMin: minutes },
    update: { overrideMin: minutes },
  });
  revalidatePath("/admin/customers");
}

/** Quita el tiempo fijado a mano: vuelve a valer lo aprendido (o la duración normal si faltan datos). */
export async function clearCustomerTime(formData: FormData) {
  const { businessId } = await requireWritable();
  const t = await ownTarget(businessId, formData);
  await prisma.customerServiceTime.updateMany({ where: t, data: { overrideMin: null } });
  revalidatePath("/admin/customers");
}

/** Empieza de cero: las respuestas anteriores dejan de contar (no se borran) y se quita el tiempo fijo. */
export async function resetCustomerTime(formData: FormData) {
  const { businessId } = await requireWritable();
  const t = await ownTarget(businessId, formData);
  await prisma.customerServiceTime.upsert({
    where: { customerId_serviceId: t },
    create: { businessId, ...t, resetAt: new Date() },
    update: { overrideMin: null, resetAt: new Date() },
  });
  revalidatePath("/admin/customers");
}
