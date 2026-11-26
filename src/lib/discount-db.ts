import { prisma } from "./db";
import { toRule, type DiscountRule } from "./discounts";

/** Descuentos del negocio (para calcular precios en el servidor). Pausados incluidos: priceFor decide qué hacer con cada uno. */
export async function loadRules(businessId: string): Promise<DiscountRule[]> {
  const rows = await prisma.discount.findMany({ where: { businessId }, orderBy: { createdAt: "asc" } });
  return rows.map(toRule);
}
