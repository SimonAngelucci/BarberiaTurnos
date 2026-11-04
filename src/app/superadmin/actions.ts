"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-auth";
import { extendTrialFor } from "@/lib/billing";
import { slugify } from "@/lib/tenant";
import { DEFAULT_PLANS, creatorCodeSchema, creatorSchema, planSchema } from "@/lib/super-schemas";
import type { FormState } from "@/app/admin/actions";

// Cada acción es un endpoint público: SIEMPRE se valida primero la sesión de Super Admin.

const firstError = (e: z.ZodError) => e.issues[0]?.message ?? "Datos inválidos";
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

// ------------------------------------------------------------------------------------------ planes

async function uniquePlanSlug(name: string) {
  const base = slugify(name);
  for (let i = 1; i < 30; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    if (!(await prisma.plan.findUnique({ where: { slug }, select: { id: true } }))) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function createPlan(_p: FormState, fd: FormData): Promise<FormState> {
  await requireSuperAdmin();
  const parsed = planSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { price, ...d } = parsed.data;
  await prisma.plan.create({ data: { ...d, priceCents: Math.round(price * 100), slug: await uniquePlanSlug(d.name) } });
  revalidatePath("/superadmin/plans");
  return { ok: true, message: "Plan creado." };
}

/** Editar no cambia lo que ya pagan las suscripciones en curso: el precio nuevo rige para quienes contraten o cambien de plan desde ahora. */
export async function updatePlan(_p: FormState, fd: FormData): Promise<FormState> {
  await requireSuperAdmin();
  const id = z.string().min(1).parse(fd.get("id"));
  const parsed = planSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { price, ...d } = parsed.data;
  const res = await prisma.plan.updateMany({ where: { id }, data: { ...d, priceCents: Math.round(price * 100), active: fd.get("active") === "on" } });
  if (res.count === 0) return { ok: false, error: "Ese plan ya no existe." };
  revalidatePath("/superadmin/plans");
  return { ok: true, message: "Plan guardado." };
}

export async function seedDefaultPlans() {
  await requireSuperAdmin();
  if ((await prisma.plan.count()) > 0) return; // nunca pisa planes existentes
  await prisma.plan.createMany({ data: DEFAULT_PLANS.map((p) => ({ ...p, features: [...p.features] })), skipDuplicates: true });
  revalidatePath("/superadmin/plans");
}

// ------------------------------------------------------------------------------------------ creadores

export async function createCreator(_p: FormState, fd: FormData): Promise<FormState> {
  await requireSuperAdmin();
  const code = creatorCodeSchema.safeParse(fd.get("code"));
  if (!code.success) return { ok: false, error: firstError(code.error) };
  const parsed = creatorSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  try {
    await prisma.creator.create({ data: { ...parsed.data, code: code.data } });
  } catch (e) {
    if (isUnique(e)) return { ok: false, error: `El código ${code.data} ya existe.` };
    throw e;
  }
  revalidatePath("/superadmin/creators");
  return { ok: true, message: `Código ${code.data} creado.` };
}

/** El código en sí no se edita: los links ya repartidos dejarían de funcionar y se perdería el seguimiento. */
export async function updateCreator(_p: FormState, fd: FormData): Promise<FormState> {
  await requireSuperAdmin();
  const id = z.string().min(1).parse(fd.get("id"));
  const parsed = creatorSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const res = await prisma.creator.updateMany({ where: { id }, data: { ...parsed.data, active: fd.get("active") === "on" } });
  if (res.count === 0) return { ok: false, error: "Ese creador ya no existe." };
  revalidatePath("/superadmin/creators");
  revalidatePath(`/superadmin/creators/${id}`);
  return { ok: true, message: "Creador guardado." };
}

/** Marca como pagado todo lo pendiente del creador (la transferencia se hace por fuera; esto deja constancia). */
export async function markEarningsPaid(fd: FormData) {
  await requireSuperAdmin();
  const creatorId = z.string().min(1).parse(fd.get("creatorId"));
  const note = z.string().trim().max(200).optional().parse(fd.get("note")?.toString() || undefined);
  await prisma.creatorEarning.updateMany({ where: { creatorId, status: "PENDING" }, data: { status: "PAID", paidAt: new Date(), note: note ?? null } });
  revalidatePath(`/superadmin/creators/${creatorId}`);
  revalidatePath("/superadmin/creators");
}

// ------------------------------------------------------------------------------------------ barberías

/** Suma días de prueba (ver reglas en extendTrialFor). */
export async function extendTrial(fd: FormData) {
  await requireSuperAdmin();
  const businessId = z.string().min(1).parse(fd.get("businessId"));
  const days = z.coerce.number().int().min(1).max(365).parse(fd.get("days"));
  await extendTrialFor(businessId, days);
  revalidatePath("/superadmin/businesses");
}

export async function toggleExempt(fd: FormData) {
  await requireSuperAdmin();
  const businessId = z.string().min(1).parse(fd.get("businessId"));
  const b = await prisma.business.findUnique({ where: { id: businessId }, select: { billingExempt: true } });
  if (!b) return;
  await prisma.business.update({ where: { id: businessId }, data: { billingExempt: !b.billingExempt } });
  revalidatePath("/superadmin/businesses");
  revalidatePath("/superadmin");
}
