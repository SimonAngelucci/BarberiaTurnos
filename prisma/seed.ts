import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@barberia.com";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "cambiame123";

  const business = await prisma.business.upsert({
    where: { slug: "demo" },
    update: {},
    create: { slug: "demo", name: "Barbería Demo", primaryColor: "#b45309" },
  });

  await prisma.adminUser.upsert({
    where: { email },
    update: {},
    create: { businessId: business.id, email, passwordHash: await bcrypt.hash(password, 10) },
  });

  if ((await prisma.service.count({ where: { businessId: business.id } })) === 0) {
    await prisma.service.createMany({
      data: [
        { businessId: business.id, name: "Corte", description: "Corte clásico o moderno", priceCents: 800000, durationMin: 30, sortOrder: 1 },
        { businessId: business.id, name: "Barba", description: "Perfilado y toalla caliente", priceCents: 600000, durationMin: 30, sortOrder: 2 },
        { businessId: business.id, name: "Corte + Barba", description: "El combo completo", priceCents: 1300000, durationMin: 60, sortOrder: 3 },
      ],
    });
  }

  if ((await prisma.barber.count({ where: { businessId: business.id } })) === 0) {
    const barber = await prisma.barber.create({ data: { businessId: business.id, name: "Barbero 1" } });
    // Lunes a sábado 09:00–19:00
    await prisma.workingHour.createMany({
      data: [1, 2, 3, 4, 5, 6].map((weekday) => ({ barberId: barber.id, weekday, startMin: 9 * 60, endMin: 19 * 60 })),
    });
  }

  console.log(`Seed listo. Admin: ${email} / ${password}`);
}

main().finally(() => prisma.$disconnect());
