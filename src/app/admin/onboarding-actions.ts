"use server";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

/** Guarda el avance de la guía de bienvenida de la barbería de la sesión (0 a 3 = pasos, 4 = terminada u omitida). */
export async function setOnboardingStep(step: number): Promise<void> {
  const { businessId } = await requireAdmin();
  const n = Number(step);
  if (!Number.isInteger(n) || n < 0 || n > 4) return;
  await prisma.business.update({ where: { id: businessId }, data: { onboardingStep: n } });
}
