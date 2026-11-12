import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma, getBusinessBySlug } from "@/lib/db";
import { BookingFlow } from "@/components/BookingFlow";
import { ReviewCta } from "@/components/site/ReviewCta";
import { payConfig } from "@/lib/payments";
import { getAccess } from "@/lib/billing";
import { asBusinessType } from "@/lib/service-icons";

export const dynamic = "force-dynamic";

/** Reserva: se llega eligiendo un servicio en la página del negocio. Acá se elige barbero, día y horario, y se cargan los datos. */
export default async function BookPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ servicio?: string }> }) {
  const { slug } = await params;
  const { servicio } = await searchParams;
  const b = await getBusinessBySlug(slug);
  if (!b) notFound();

  const [services, barbers, profile, access] = await Promise.all([
    prisma.service.findMany({ where: { businessId: b.id, active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.barber.findMany({ where: { businessId: b.id, active: true }, orderBy: { name: "asc" } }),
    prisma.businessProfile.findUnique({ where: { businessId: b.id }, select: { reviewsEnabled: true } }),
    getAccess(b.id),
  ]);

  // Sin un servicio válido (o «próximamente») no hay nada que reservar: se vuelve a la lista.
  const chosen = services.find((s) => s.id === servicio && !s.comingSoon);
  if (!chosen) redirect(`/b/${b.slug}#servicios`);

  const home = `/b/${b.slug}`;

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-6">
      <header className="mb-5 flex items-center justify-between gap-3">
        <Link href={`${home}#servicios`} className="btn-ghost !px-4 !py-2 text-sm">
          ← Volver
        </Link>
        <div className="flex min-w-0 items-center gap-3">
          {b.logoUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={b.logoUrl} alt="" className="h-9 w-9 shrink-0 rounded-full bg-white object-cover shadow-sm" />}
          <h1 className="truncate text-lg font-bold tracking-tight">{b.name}</h1>
        </div>
      </header>

      <h2 className="mb-3 text-2xl font-extrabold tracking-tight">Reservá tu turno</h2>

      {!access.bookable ? (
        <div className="card space-y-1 text-center">
          <div className="text-3xl">🛠️</div>
          <h2 className="text-lg font-bold">Reservas no disponibles por ahora</h2>
          <p className="text-sm text-neutral-600">Este negocio no está aceptando reservas online en este momento. Probá más tarde o comunicate con el negocio directamente.</p>
        </div>
      ) : (
        <BookingFlow
          mode="book"
          initialServiceId={chosen.id}
          slug={b.slug}
          timezone={b.timezone}
          currency={b.currency}
          maxAdvanceDays={Math.min(b.maxAdvanceDays, 60)}
          pay={payConfig(b)}
          allowChanges={b.allowClientChanges}
          logoUrl={b.logoUrl}
          businessType={asBusinessType(b.businessType)}
          learnDurations={b.learnDurations}
          services={services.map((s) => ({
            id: s.id,
            name: s.name,
            description: s.description,
            priceCents: s.priceCents,
            durationMin: s.durationMin,
            comingSoon: s.comingSoon,
            iconKey: s.iconKey,
            iconUrl: s.iconUrl,
          }))}
          barbers={barbers.map((x) => ({ id: x.id, name: x.name, photoUrl: x.photoUrl, bio: x.bio }))}
        />
      )}

      {profile?.reviewsEnabled && (
        <div className="mt-10">
          <ReviewCta slug={b.slug} after />
        </div>
      )}
    </main>
  );
}
