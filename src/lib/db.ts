import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = prisma;

/** MVP single-tenant: el negocio es el primero. Para multi-tenant, resolver por host/slug. */
export async function getBusiness() {
  const b = await prisma.business.findFirst({ orderBy: { createdAt: "asc" } });
  if (!b) throw new Error("No hay negocio configurado. Ejecutá `npm run db:seed`.");
  return b;
}
