import { Icon } from "@/components/ui/Icon";
import { notFound, redirect } from "next/navigation";
import { prisma, getBusinessBySlug } from "@/lib/db";
import { BookingFlow } from "@/components/BookingFlow";
import { ReviewCta } from "@/components/site/ReviewCta";
import { payConfig } from "@/lib/payments";
import { getAccess } from "@/lib/billing";
import { asBusinessType } from "@/lib/service-icons";
import { PublicHeader } from "@/components/site/PublicHeader";

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
    <main className="mx-auto min-h-screen max-w-[480px]">
      <PublicHeader name={b.name} logoUrl={b.logoUrl} title="Reservá tu turno" back={{ href: `${home}#servicios`, label: "Volver a los servicios" }} />
      <div className="px-4 py-6">      {!access.bookable ? (
        <div className="card space-y-1 text-center">
          <Icon name="wrench" size={32} className="mx-auto text-neutral-500" />
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
      </div>
    </main>
  );
}
