import { notFound } from "next/navigation";
import { prisma, getBusinessBySlug } from "@/lib/db";
import { getAccess } from "@/lib/billing";
import { Gallery } from "@/components/site/Gallery";
import { PublicHeader } from "@/components/site/PublicHeader";

export const dynamic = "force-dynamic";

/** Galería completa en formato collage, en una página aparte. */
export default async function GalleryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const b = await getBusinessBySlug(slug);
  if (!b) notFound();

  const photos = await prisma.businessPhoto.findMany({
    where: { businessId: b.id, visible: true, kind: "GALLERY" },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { url: true, mediaType: true, posterUrl: true },
  });
  const items = photos.filter((p) => p.mediaType === "IMAGE" || !!p.posterUrl).map((p) => ({ url: p.url, type: p.mediaType, poster: p.posterUrl }));
  const accepting = (await getAccess(b.id)).bookable;
  const home = `/b/${b.slug}`;

  return (
    <main className="mx-auto min-h-screen max-w-[480px]">
      <PublicHeader name={b.name} logoUrl={b.logoUrl} title="Galería" back={{ href: home, label: "Volver" }} />
      <div className="px-4 py-6">
      {items.length === 0 ? (
        <p className="card text-center text-sm text-neutral-500">Todavía no hay fotos en la galería.</p>
      ) : (
        <Gallery items={items} showAll bookHref={accepting ? `${home}#servicios` : undefined} />
      )}
      </div>
    </main>
  );
}
