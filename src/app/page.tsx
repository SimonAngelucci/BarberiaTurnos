import { prisma, getBusiness } from "@/lib/db";
import { BookingFlow } from "@/components/BookingFlow";

export default async function HomePage() {
  const b = await getBusiness();
  const [services, barbers] = await Promise.all([
    prisma.service.findMany({ where: { businessId: b.id, active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.barber.findMany({ where: { businessId: b.id, active: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <header className="mb-6 text-center">
        {b.logoUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={b.logoUrl} alt={b.name} className="mx-auto mb-3 h-16 w-16 rounded-full object-cover" />}
        <h1 className="text-2xl font-bold">{b.name}</h1>
        <p className="text-neutral-500">{b.tagline}</p>
      </header>
      <BookingFlow
        timezone={b.timezone}
        currency={b.currency}
        maxAdvanceDays={Math.min(b.maxAdvanceDays, 60)}
        services={services.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          priceCents: s.priceCents,
          durationMin: s.durationMin,
        }))}
        barbers={barbers.map((x) => ({ id: x.id, name: x.name }))}
      />
    </main>
  );
}
