import { notFound } from "next/navigation";
import { prisma, getBusinessBySlug } from "@/lib/db";
import { BookingFlow } from "@/components/BookingFlow";

export default async function BusinessPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const b = await getBusinessBySlug(slug);
  if (!b) notFound();

  const [services, barbers] = await Promise.all([
    prisma.service.findMany({ where: { businessId: b.id, active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.barber.findMany({ where: { businessId: b.id, active: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 py-8">
      <header className="mb-6 text-center">
        {b.logoUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={b.logoUrl} alt={b.name} className="mx-auto mb-3 h-20 w-20 rounded-full bg-white object-cover shadow" />}
        <h1 className="text-2xl font-bold">{b.name}</h1>
        <p className="opacity-70">{b.tagline}</p>
      </header>
      <BookingFlow
        slug={b.slug}
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
        barbers={barbers.map((x) => ({ id: x.id, name: x.name, photoUrl: x.photoUrl, bio: x.bio }))}
      />
    </main>
  );
}
