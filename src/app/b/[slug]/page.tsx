import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma, getBusinessBySlug } from "@/lib/db";
import { BookingFlow } from "@/components/BookingFlow";
import { payConfig } from "@/lib/payments";
import { asBusinessType } from "@/lib/service-icons";
import { getAccess } from "@/lib/billing";
import { FONTS, fontsHref, resolveConfig, usedFonts } from "@/lib/page-config";
import { telHref, whatsappHref, prettyPhone } from "@/lib/profile";
import { SiteNav, type NavItem } from "@/components/site/SiteNav";
import { SiteSection } from "@/components/site/SiteSection";
import { HeroCarousel } from "@/components/site/HeroCarousel";
import { Gallery } from "@/components/site/Gallery";
import { Reviews } from "@/components/site/Reviews";
import { BusinessCard } from "@/components/site/BusinessCard";
import { MobileBookBar } from "@/components/site/MobileBookBar";
import { ContactCard, MapEmbed, TextCard, hasContact, safePhone } from "@/components/site/InfoSections";

export default async function BusinessPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const b = await getBusinessBySlug(slug);
  if (!b) notFound();

  const [services, barbers, profile, photos, reviews, reviewStats] = await Promise.all([
    prisma.service.findMany({ where: { businessId: b.id, active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.barber.findMany({ where: { businessId: b.id, active: true }, orderBy: { name: "asc" } }),
    prisma.businessProfile.findUnique({ where: { businessId: b.id } }),
    // Solo lo visible: lo que el administrador ocultó sigue guardado pero no llega a la página.
    prisma.businessPhoto.findMany({
      where: { businessId: b.id, visible: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { url: true, kind: true, mediaType: true, posterUrl: true },
    }),
    prisma.review.findMany({
      where: { businessId: b.id, status: "APPROVED" },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, authorName: true, rating: true, comment: true, createdAt: true },
    }),
    prisma.review.aggregate({ where: { businessId: b.id, status: "APPROVED" }, _avg: { rating: true }, _count: { _all: true } }),
  ]);

  const config = resolveConfig(b.pageConfig);
  const fonts = fontsHref(usedFonts(config));

  // Todo sale del panel: las secciones sin contenido no se muestran.
  const hero = photos.filter((p) => p.kind === "HERO" && p.mediaType === "IMAGE").map((p) => p.url);
  const gallery = photos
    .filter((p) => p.kind === "GALLERY" && (p.mediaType === "IMAGE" || !!p.posterUrl))
    .map((p) => ({ url: p.url, type: p.mediaType, poster: p.posterUrl }));
  const hasReviews = !!profile?.reviewsEnabled;
  const hasAbout = !!profile?.aboutText;
  const hasPolicy = !!profile?.policyText;
  const hasContactInfo = !!profile && hasContact(profile);
  const hasGallery = gallery.length > 0;
  const hasAddress = !!(profile?.address || profile?.mapsUrl);

  // El nombre y el eslogan siguen pudiendo personalizarse desde el editor de diseño.
  const heroTitle = config.blocks.find((x) => x.type === "title");
  const heroTagline = config.blocks.find((x) => x.type === "tagline");
  const title = heroTitle && "text" in heroTitle && heroTitle.text ? heroTitle.text : b.name;
  const tagline = heroTagline && "text" in heroTagline && heroTagline.text ? heroTagline.text : b.tagline;

  const phone = safePhone(profile?.phone ?? null) ? profile!.phone! : safePhone(profile?.whatsapp ?? null) ? profile!.whatsapp! : null;
  const isWhatsappOnly = !!phone && phone === profile?.whatsapp && phone !== profile?.phone;

  const nav: NavItem[] = [
    { id: "servicios", label: "Servicios" },
    ...(hasAbout ? [{ id: "acerca", label: "Acerca de" }] : []),
    ...(hasGallery ? [{ id: "galeria", label: "Galería" }] : []),
    ...(hasReviews ? [{ id: "resenas", label: "Reseñas" }] : []),
    ...(hasAddress || hasContactInfo ? [{ id: "direccion", label: "Dirección" }] : []),
  ];

  // Suscripción vencida o con pago pendiente: en lugar del formulario se muestra un aviso claro.
  const accepting = (await getAccess(b.id)).bookable;

  const booking = !accepting ? (
    <div className="card space-y-1 text-center">
      <div className="text-3xl">🛠️</div>
      <h2 className="text-lg font-bold">Reservas no disponibles por ahora</h2>
      <p className="text-sm text-neutral-600">Este negocio no está aceptando reservas online en este momento. Probá más tarde o comunicate con el negocio directamente.</p>
    </div>
  ) : (
    <BookingFlow
      slug={b.slug}
      timezone={b.timezone}
      currency={b.currency}
      maxAdvanceDays={Math.min(b.maxAdvanceDays, 60)}
      pay={payConfig(b)}
      allowChanges={b.allowClientChanges}
      logoUrl={b.logoUrl}
      businessType={asBusinessType(b.businessType)}
      learnDurations={b.learnDurations}
      mode="list"
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
  );

  return (
    <main
      className="min-h-screen"
      style={{ fontFamily: FONTS[config.global.font].css, ["--card-radius" as string]: `${config.global.cardRadius}px` }}
    >
      {/* React 19 sube este <link> al <head> y evita duplicados */}
      {fonts && <link rel="stylesheet" href={fonts} precedence="default" />}

      <SiteNav
        items={nav}
        phoneHref={phone ? (isWhatsappOnly ? whatsappHref(phone) : telHref(phone)) : null}
        phoneLabel={phone ? prettyPhone(phone) : null}
      />

      <HeroCarousel photos={hero} />

      <div className="mx-auto grid max-w-5xl items-start gap-6 px-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10">
        {/* Tarjeta del negocio: arriba en celular, a la derecha (y fija al desplazarse) en pantallas grandes */}
        <aside className="-mt-10 lg:order-2 lg:-mt-24 lg:sticky lg:top-20">
          <BusinessCard
            name={title}
            tagline={tagline}
            logoUrl={b.logoUrl}
            average={reviewStats._avg.rating}
            total={reviewStats._count._all}
            showRating={hasReviews}
            contact={profile}
            bookHref="#servicios"
            bookLabel="Reservar"
          />
        </aside>

        <div className="min-w-0 space-y-10 pt-2 lg:order-1 lg:pt-8">
          {hasPolicy && (
            <SiteSection title="Política de reservas">
              <TextCard text={profile!.policyText!} />
            </SiteSection>
          )}

          <SiteSection id="servicios">
            {booking}
            {b.allowClientChanges && (
              <p className="mt-4 text-sm">
                <Link href={`/b/${b.slug}/turno`} className="underline opacity-80 hover:opacity-100">
                  ¿Ya tenés un turno? Reprogramalo o cancelalo
                </Link>
              </p>
            )}
          </SiteSection>

          {hasAbout && (
            <SiteSection id="acerca" title={profile!.aboutTitle || "Acerca de"}>
              <TextCard text={profile!.aboutText!} plain />
            </SiteSection>
          )}

          {hasGallery && (
            <SiteSection id="galeria" title="Galería">
              <Gallery items={gallery} visible={profile?.galleryVisible ?? 4} allHref={profile?.galleryShowAll ? `/b/${b.slug}/galeria` : undefined} bookHref={accepting ? "#servicios" : undefined} />
            </SiteSection>
          )}

          {hasReviews && (
            <SiteSection id="resenas" title="Reseñas">
              <Reviews slug={b.slug} reviews={reviews} average={reviewStats._avg.rating} total={reviewStats._count._all} timezone={b.timezone} />
            </SiteSection>
          )}

          {(hasAddress || hasContactInfo) && (
            <SiteSection id="direccion" title="Dirección y contacto" center>
              <div className="space-y-4">
                {profile?.address && <MapEmbed address={profile.address} />}
                <ContactCard p={profile!} />
              </div>
            </SiteSection>
          )}
        </div>
      </div>

      {/* Franja de cierre: el color de fondo de la barbería con un toque de su color de marca, así siempre combina */}
      <footer
        className="mt-16 border-t border-[color-mix(in_srgb,var(--page-fg)_10%,transparent)] px-4 pb-24 pt-10 text-center lg:pb-12"
        style={{ background: "color-mix(in srgb, var(--page-bg) 90%, var(--brand))", color: "var(--page-fg)" }}
      >
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-3">
          {b.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={b.logoUrl} alt="" className="h-12 w-12 rounded-full bg-white object-cover shadow-sm" />
          )}
          <p className="text-lg font-bold tracking-tight">{title}</p>
          {profile?.address && <p className="text-sm opacity-70">{profile.address}</p>}
          {accepting && (
            <a href="#servicios" className="btn mt-1 !rounded-full !px-6">
              Reservar turno
            </a>
          )}
        </div>
      </footer>

      {accepting && <MobileBookBar targetId="servicios" label="Reservar" />}
    </main>
  );
}
