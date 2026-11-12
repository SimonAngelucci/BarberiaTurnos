import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { newTrialEnd } from "./billing";

/** "Barbería Don Pepe!" -> "barberia-don-pepe" */
export function slugify(input: string) {
  return (
    input
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "negocio"
  );
}

const RESERVED = new Set(["admin", "api", "b", "registro", "login", "demo"]);

/** Slug único: base, base-2, base-3... */
async function uniqueSlug(name: string) {
  const base = slugify(name);
  for (let i = 1; i < 50; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    if (i === 1 && RESERVED.has(slug)) continue;
    const taken = await prisma.business.findUnique({ where: { slug }, select: { id: true } });
    if (!taken) return slug;
  }
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

export class EmailTakenError extends Error {}

/**
 * Crea una barbería completa: negocio + admin + un barbero con horario Lun–Sáb 9–19
 * y servicios de ejemplo para que la página pública no quede vacía.
 */
export async function createBusiness(input: { name: string; email: string; password: string; creator?: { id: string; code: string } | null }) {
  const email = input.email.trim().toLowerCase();
  if (await prisma.adminUser.findUnique({ where: { email }, select: { id: true } })) throw new EmailTakenError();
  const passwordHash = await bcrypt.hash(input.password, 10);

  // Reintenta si dos registros simultáneos eligen el mismo slug.
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = await uniqueSlug(input.name);
    try {
      // Una sola escritura anidada: es atómica y evita el timeout de 5 s de las transacciones
      // interactivas (que con la latencia a la base en la nube dejaba el registro a medias).
      const business = await prisma.business.create({
        data: {
          slug,
          name: input.name.trim(),
          onboardingStep: 0, // las barberías nuevas arrancan con la guía de bienvenida
          // Quién la trajo (si usó un código de creador) y el mes de prueba gratis: sin tarjeta y sin cobros.
          creatorId: input.creator?.id ?? null,
          creatorCode: input.creator?.code ?? null,
          subscription: { create: { status: "TRIAL", trialEndsAt: newTrialEnd() } },
          admins: { create: { email, passwordHash } },
          services: {
            createMany: {
              data: [
                { name: "Servicio 1", description: "Editá este servicio de ejemplo", priceCents: 800000, durationMin: 30, sortOrder: 1 },
                { name: "Servicio 2", description: "Editá este servicio de ejemplo", priceCents: 600000, durationMin: 30, sortOrder: 2 },
              ],
            },
          },
          barbers: {
            create: {
              name: "Profesional 1",
              workingHours: { createMany: { data: [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startMin: 540, endMin: 1140 })) } },
            },
          },
        },
        include: { admins: true },
      });
      return { business, admin: business.admins[0] };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const target = String(e.meta?.target ?? "");
        if (target.includes("email")) throw new EmailTakenError();
        continue; // slug ocupado: reintentar
      }
      throw e;
    }
  }
  throw new Error("No se pudo generar un link único");
}
