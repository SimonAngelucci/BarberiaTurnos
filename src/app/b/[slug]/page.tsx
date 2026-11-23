import { Icon } from "@/components/ui/Icon";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import { prisma, getBusinessBySlug } from "@/lib/db";
import { BookingFlow } from "@/components/BookingFlow";
import { payConfig } from "@/lib/payments";
import { asBusinessType } from "@/lib/service-icons";
import { getAccess } from "@/lib/billing";
import { FONTS, fontsHref, resolveConfig, usedFonts } from "@/lib/page-config";
import { telHref, whatsappHref, prettyPhone, mapsHref, SOCIAL_LABELS } from "@/lib/profile";
import { SiteNav, type NavItem } from "@/components/site/SiteNav";
import { SiteSection } from "@/components/site/SiteSection";
import { HeroCarousel } from "@/components/site/HeroCarousel";
import { Gallery } from "@/components/site/Gallery";
import { Reviews } from "@/components/site/Reviews";
import { MobileBookBar } from "@/components/site/MobileBookBar";
import { Stars } from "@/components/site/Stars";
import { ThemeCycleButton } from "@/components/ui/ThemeToggle";
import { ContactCard, MapEmbed, TextCard, hasContact, safePhone, safeUrl } from "@/components/site/InfoSections";

const SOCIALS = ["instagram", "facebook", "tiktok", "youtube", "website"] as const;
const EXTERNAL = { target: "_blank", rel: "noopener noreferrer" } as const;
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Chip del bloque de color: fondo translúcido del color del texto, así se lee sobre el amarillo y sobre el color propio. */
const chip = "inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold";
const chipStyle = { background: "color-mix(in srgb, var(--on-hero) 12%, transparent)" } as const;

export default async function BusinessPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const b = await getBusinessBySlug(slug);
  if (!b) notFound();

  const todayWeekday = DateTime.now().setZone(b.timezone).weekday % 7; // 0 = domingo, igual que TimeSlot.weekday
  const [services, barbers, profile, photos, reviews, reviewStats, todaySlots] = await Promise.all([
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
    prisma.timeSlot.findMany({ where: { weekday: todayWeekday, barber: { businessId: b.id, active: true } }, select: { startMin: true } }),
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
  const callHref = phone ? (isWhatsappOnly ? whatsappHref(phone) : telHref(phone)) : null;
  const mapsCandidate = profile ? mapsHref(profile.mapsUrl, profile.address) : null;
  const maps = safeUrl(mapsCandidate) ? mapsCandidate : null;
  const socials = profile ? SOCIALS.filter((k) => safeUrl(profile[k])) : [];
  const average = reviewStats._avg.rating;
  const total = reviewStats._count._all;

  // Horario de hoy: del primer al último horario que se ofrece (según lo cargado en el panel).
  const starts = todaySlots.map((s) => s.startMin);
  const hoursToday = starts.length ? `Hoy: ${hhmm(Math.min(...starts))} a ${hhmm(Math.max(...starts))} hs` : "Hoy no atiende";

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
      <Icon name="wrench" size={32} className="mx-auto text-neutral-500" />
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
      logoUrl={null}
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
    <main className="mx-auto min-h-screen max-w-[480px]" style={{ fontFamily: FONTS[config.global.font].css, ["--card-radius" as string]: `${config.global.cardRadius}px` }}>
      {/* React 19 sube este <link> al <head> y evita duplicados */}
      {fonts && <link rel="stylesheet" href={fonts} precedence="default" />}

      {/* Bloque de color: logo, nombre, dirección, horario de hoy y redes */}
      <header className="hero-block px-5 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <div className="topbar flex items-center justify-end gap-1.5">
          <ThemeCycleButton />
          {callHref && (
            <a href={callHref} aria-label={phone ? `Llamar al ${prettyPhone(phone)}` : "Llamar"} title="Llamar" className="flex h-9 w-9 items-center justify-center rounded-full">
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
              </svg>
            </a>
          )}
        </div>

        <div className="mt-3 flex items-center gap-4">
          {b.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={b.logoUrl} alt="" className="h-[4.5rem] w-[4.5rem] shrink-0 rounded-full bg-[#fbfaf8] object-cover ring-4 ring-black/10" />
          ) : (
            <div aria-hidden className="flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center rounded-full bg-ink text-2xl font-semibold text-primary">
              {title.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-balance text-3xl font-light leading-tight tracking-tight">{title}</h1>
            {tagline && <p className="mt-0.5 text-sm opacity-80">{tagline}</p>}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <span className={chip} style={chipStyle}>
            <Icon name="clock" size={14} />
            {hoursToday}
          </span>
          {profile?.address && (
            <span className={chip} style={chipStyle}>
              <Icon name="map-pin" size={14} className="shrink-0" />
              <span className="truncate">{profile.address}</span>
            </span>
          )}
          {maps && (
            <a href={maps} {...EXTERNAL} className={chip} style={chipStyle}>
              Cómo llegar
            </a>
          )}
          {hasReviews && (
            <a href="#resenas" className={chip} style={chipStyle}>
              {total > 0 && average !== null ? (
                <>
                  <Stars value={average} size={13} />
                  {average.toFixed(1)} ({total})
                </>
              ) : (
                "Sé el primero en opinar"
              )}
            </a>
          )}
          {profile?.whatsapp && safePhone(profile.whatsapp) && (
            <a href={whatsappHref(profile.whatsapp)} {...EXTERNAL} className={chip} style={chipStyle}>
              WhatsApp
            </a>
          )}
          {profile &&
            socials.map((k) => (
              <a key={k} href={profile[k]!} {...EXTERNAL} className={chip} style={chipStyle}>
                {SOCIAL_LABELS[k]}
              </a>
            ))}
        </div>

        {accepting && (
          <a href="#servicios" className="btn mt-6 w-full !rounded-full !bg-ink !py-3.5 text-base font-semibold !text-primary">
            Reservar turno
          </a>
        )}
      </header>

      <SiteNav items={nav} phoneHref={null} phoneLabel={null} />

      <div className="space-y-10 px-4 pb-6 pt-6">
        {hero.length > 0 && <HeroCarousel photos={hero} />}

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

        {barbers.length > 0 && (
          <SiteSection title="Profesionales" count={barbers.length}>
            <ul className="flex flex-wrap gap-2.5">
              {barbers.map((x) => (
                <li key={x.id} className="flex items-center gap-2.5 rounded-2xl bg-surface py-2 pl-2 pr-4 text-sm font-semibold">
                  {x.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={x.photoUrl} alt="" className="h-9 w-9 shrink-0 rounded-xl bg-surface-muted object-cover" />
                  ) : (
                    <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink text-primary">
                      {x.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  {x.name}
                </li>
              ))}
            </ul>
          </SiteSection>
        )}

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
          <SiteSection id="resenas" title="Reseñas" count={total}>
            <Reviews slug={b.slug} reviews={reviews} average={average} total={total} timezone={b.timezone} />
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

      {/* Cierre: sección negra con curva arriba, como en el panel */}
      <footer className="mt-6 rounded-t-[2.5rem] bg-ink px-5 pb-28 pt-10 text-center text-white">
        <div className="flex flex-col items-center gap-3">
          {b.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={b.logoUrl} alt="" className="h-12 w-12 rounded-full bg-[#fbfaf8] object-cover" />
          )}
          <p className="text-xl font-light tracking-tight">{title}</p>
          {profile?.address && <p className="text-sm opacity-70">{profile.address}</p>}
          {accepting && (
            <a href="#servicios" className="btn mt-1 !rounded-full !px-8">
              Reservar turno
            </a>
          )}
        </div>
      </footer>

      {accepting && <MobileBookBar targetId="servicios" label="Reservar" />}
    </main>
  );
}
