import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma, getBusinessBySlug } from "@/lib/db";
import { BookingFlow } from "@/components/BookingFlow";
import { payConfig } from "@/lib/payments";
import { fontsHref, resolveConfig, usedFonts } from "@/lib/page-config";
import { BlockBox, BlockContent, PageFrame } from "@/components/page/BlockView";

export default async function BusinessPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const b = await getBusinessBySlug(slug);
  if (!b) notFound();

  const [services, barbers] = await Promise.all([
    prisma.service.findMany({ where: { businessId: b.id, active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.barber.findMany({ where: { businessId: b.id, active: true }, orderBy: { name: "asc" } }),
  ]);

  const config = resolveConfig(b.pageConfig);
  const fonts = fontsHref(usedFonts(config));

  const booking = (
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
      <PageFrame config={config}>
        {config.blocks.map((block) => (
          <BlockBox key={block.id} block={block}>
            <BlockContent block={block} ctx={{ name: b.name, tagline: b.tagline, logoUrl: b.logoUrl, booking }} />
          </BlockBox>
        ))}
      </PageFrame>
      {b.allowClientChanges && (
        <p className="pb-8 text-center text-sm">
          <Link href={`/b/${b.slug}/turno`} className="underline opacity-80 hover:opacity-100">
            ¿Ya tenés un turno? Reprogramalo o cancelalo
          </Link>
        </p>
      )}
    </main>
  );
}
