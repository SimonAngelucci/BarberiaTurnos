import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma, getBusinessBySlug } from "@/lib/db";
import { BookingFlow } from "@/components/BookingFlow";
import { payConfig } from "@/lib/payments";
import { getAccess } from "@/lib/billing";
import { FONTS, fontsHref, resolveConfig, usedFonts } from "@/lib/page-config";
import { BlockBox, BlockContent, PageFrame } from "@/components/page/BlockView";
import { SiteNav, type NavItem } from "@/components/site/SiteNav";
import { SiteSection } from "@/components/site/SiteSection";
import { HeroCarousel } from "@/components/site/HeroCarousel";
import { Gallery } from "@/components/site/Gallery";
import { Reviews } from "@/components/site/Reviews";
import { ContactCard, TextCard, hasContact } from "@/components/site/InfoSections";

export default async function BusinessPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const b = await getBusinessBySlug(slug);
  if (!b) notFound();

  const [services, barbers, profile, photos, reviews, reviewStats] = await Promise.all([
    prisma.service.findMany({ where: { businessId: b.id, active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.barber.findMany({ where: { businessId: b.id, active: true }, orderBy: { name: "asc" } }),
    prisma.businessProfile.findUnique({ where: { businessId: b.id } }),
    prisma.businessPhoto.findMany({ where: { businessId: b.id }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { url: true, kind: true } }),
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

  // Qué secciones tiene esta barbería. Las que no tienen contenido no se muestran; sin nada cargado la página queda como siempre.
  const hero = photos.filter((p) => p.kind === "HERO").map((p) => p.url);
  const gallery = photos.filter((p) => p.kind === "GALLERY").map((p) => p.url);
  const hasReviews = !!profile?.reviewsEnabled;
  const hasAbout = !!profile?.aboutText;
  const hasPolicy = !!profile?.policyText;
  const hasContactInfo = !!profile && hasContact(profile);
  const hasGallery = gallery.length > 0;
  const extras = hero.length > 0 || hasReviews || hasAbout || hasPolicy || hasContactInfo || hasGallery;

  // Con portada, el logo, el nombre y el eslogan ya se muestran sobre las fotos: no se repiten en el bloque de reservas.
  const heroTitle = config.blocks.find((x) => x.type === "title");
  const heroTagline = config.blocks.find((x) => x.type === "tagline");
  const pageConfig = hero.length > 0 ? { ...config, blocks: config.blocks.filter((x) => x.type !== "logo" && x.type !== "title" && x.type !== "tagline") } : config;

  const nav: NavItem[] = [
    ...(hero.length > 0 ? [{ id: "inicio", label: "Inicio" }] : []),
    { id: "turnos", label: "Turnos" },
    ...(hasReviews ? [{ id: "resenas", label: "Reseñas" }] : []),
    ...(hasGallery ? [{ id: "galeria", label: "Galería" }] : []),
    ...(hasAbout ? [{ id: "acerca", label: "Acerca de" }] : []),
    ...(hasContactInfo ? [{ id: "contacto", label: "Contacto" }] : []),
  ];

  // Suscripción vencida o con pago pendiente: en lugar del formulario se muestra un aviso claro.
  const accepting = (await getAccess(b.id)).bookable;

  const booking = !accepting ? (
    <div className="card space-y-1 text-center">
      <div className="text-3xl">🛠️</div>
      <h2 className="text-lg font-bold">Reservas no disponibles por ahora</h2>
      <p className="text-sm text-neutral-600">Esta barbería no está aceptando reservas online en este momento. Probá más tarde o comunicate con ella directamente.</p>
    </div>
  ) : (
    <BookingFlow
      slug={b.slug}
      timezone={b.timezone}
      currency={b.currency}
      maxAdvanceDays={Math.min(b.maxAdvanceDays, 60)}
      pay={payConfig(b)}
      allowChanges={b.allowClientChanges}
      services={services.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        priceCents: s.priceCents,
        durationMin: s.durationMin,
      }))}
      barbers={barbers.map((x) => ({ id: x.id, name: x.name, photoUrl: x.photoUrl, bio: x.bio }))}
    />
  );

  return (
    <main className="min-h-screen">
      {/* React 19 sube este <link> al <head> y evita duplicados */}
      {fonts && <link rel="stylesheet" href={fonts} precedence="default" />}

      {extras && <SiteNav items={nav} />}

      {hero.length > 0 && (
        <div style={{ fontFamily: FONTS[config.global.font].css }}>
          <HeroCarousel
            photos={hero}
            name={heroTitle && "text" in heroTitle && heroTitle.text ? heroTitle.text : b.name}
            tagline={heroTagline && "text" in heroTagline && heroTagline.text ? heroTagline.text : b.tagline}
            logoUrl={b.logoUrl}
            ctaHref="#turnos"
          />
        </div>
      )}

      <div id="turnos" className="scroll-mt-14">
        <PageFrame config={pageConfig}>
          {pageConfig.blocks.map((block) => (
            <BlockBox key={block.id} block={block}>
              <BlockContent block={block} ctx={{ name: b.name, tagline: b.tagline, logoUrl: b.logoUrl, booking }} />
            </BlockBox>
          ))}
        </PageFrame>
      </div>

      {b.allowClientChanges && (
        <p className={`text-center text-sm ${extras ? "pb-2" : "pb-8"}`}>
          <Link href={`/b/${b.slug}/turno`} className="underline opacity-80 hover:opacity-100">
            ¿Ya tenés un turno? Reprogramalo o cancelalo
          </Link>
        </p>
      )}

      {hasPolicy && (
        <SiteSection title="Política de reserva" config={config}>
          <TextCard text={profile!.policyText!} />
        </SiteSection>
      )}

      {hasReviews && (
        <SiteSection id="resenas" title="Reseñas" config={config}>
          <Reviews slug={b.slug} reviews={reviews} average={reviewStats._avg.rating} total={reviewStats._count._all} timezone={b.timezone} />
        </SiteSection>
      )}

      {hasGallery && (
        <SiteSection id="galeria" title="Galería" config={config}>
          <Gallery photos={gallery} />
        </SiteSection>
      )}

      {hasAbout && (
        <SiteSection id="acerca" title={profile!.aboutTitle || "Acerca de"} config={config}>
          <TextCard text={profile!.aboutText!} />
        </SiteSection>
      )}

      {hasContactInfo && (
        <SiteSection id="contacto" title="Contacto" config={config}>
          <ContactCard p={profile!} />
        </SiteSection>
      )}

      {extras && <div className="h-8" />}
    </main>
  );
}
