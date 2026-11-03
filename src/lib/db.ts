import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = prisma;

/** Negocio de la página pública, resuelto por el slug de la URL (/b/[slug]). */
export async function getBusinessBySlug(slug: string) {
  return prisma.business.findUnique({ where: { slug: slug.toLowerCase() } });
}

/** Negocio del admin logueado (siempre por el businessId de la sesión). */
export async function getBusinessById(id: string) {
  const b = await prisma.business.findUnique({ where: { id } });
  if (!b) throw new Error("Negocio inexistente");
  return b;
}
