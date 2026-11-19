/**
 * Convierte la agenda calculada de antes (franjas de atención + intervalo + horarios desactivados) en horarios cargados a mano
 * (TimeSlot), para que cada profesional siga mostrando los mismos horarios que ya tenía.
 *
 * Idempotente: no toca a los profesionales que ya tienen horarios nuevos. Uso: npx tsx scripts/migrate-time-slots.ts
 */
import { prisma } from "../src/lib/db";

async function main() {
  const barbers = await prisma.barber.findMany({
    select: { id: true, name: true, business: { select: { name: true, slotIntervalMin: true } }, _count: { select: { timeSlots: true } } },
  });
  let created = 0;
  let converted = 0;
  for (const b of barbers) {
    if (b._count.timeSlots > 0) continue;
    const [hours, disabled] = await Promise.all([
      prisma.workingHour.findMany({ where: { barberId: b.id } }),
      prisma.disabledSlot.findMany({ where: { barberId: b.id } }),
    ]);
    const interval = b.business.slotIntervalMin;
    const off = new Set(disabled.map((d) => `${d.weekday}:${d.startMin}`));
    const rows = new Map<string, { barberId: string; weekday: number; startMin: number }>();
    for (const h of hours) {
      for (let m = h.startMin; m + interval <= h.endMin; m += interval) {
        if (off.has(`${h.weekday}:${m}`)) continue; // lo que estaba desactivado, no se carga
        rows.set(`${h.weekday}:${m}`, { barberId: b.id, weekday: h.weekday, startMin: m });
      }
    }
    if (rows.size) {
      await prisma.timeSlot.createMany({ data: [...rows.values()], skipDuplicates: true });
      created += rows.size;
      converted++;
      console.log(`${b.business.name} / ${b.name}: ${rows.size} horarios`);
    }
  }
  console.log(`Listo: ${converted} profesionales convertidos, ${created} horarios creados.`);
  await prisma.$disconnect();
}

main();
