import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = prisma;

// Campos secretos: jamás deben viajar en el objeto "negocio" que usan páginas y componentes
// (React en desarrollo hasta serializa en el HTML lo que devuelven las funciones async).
const SECRETS = { mpAccessToken: true } as const;

/** Negocio de la página pública, resuelto por el slug de la URL (/b/[slug]). Sin secretos. */
export async function getBusinessBySlug(slug: string) {
  return prisma.business.findUnique({ where: { slug: slug.toLowerCase() }, omit: SECRETS });
}

/** Negocio del admin logueado (siempre por el businessId de la sesión). Sin secretos. */
export async function getBusinessById(id: string) {
  const b = await prisma.business.findUnique({ where: { id }, omit: SECRETS });
  if (!b) throw new Error("Negocio inexistente");
  return b;
}

/** SOLO para crear cobros en el servidor: incluye el Access Token cifrado. No pasar a componentes. */
export async function getBusinessForCheckout(slug: string) {
  return prisma.business.findUnique({ where: { slug: slug.toLowerCase() } });
}
