import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma, getBusinessBySlug } from "@/lib/db";
import { getAccess } from "@/lib/billing";
import { Gallery } from "@/components/site/Gallery";

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
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between gap-3">
        <Link href={home} className="btn-ghost !px-4 !py-2 text-sm">
          ← Volver
        </Link>
        <div className="flex min-w-0 items-center gap-3">
          {b.logoUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={b.logoUrl} alt="" className="h-9 w-9 shrink-0 rounded-full bg-white object-cover shadow-sm" />}
          <h1 className="truncate text-xl font-bold tracking-tight">Galería · {b.name}</h1>
        </div>
      </header>
      {items.length === 0 ? (
        <p className="card text-center text-sm text-neutral-500">Todavía no hay fotos en la galería.</p>
      ) : (
        <Gallery items={items} showAll bookHref={accepting ? `${home}#servicios` : undefined} />
      )}
    </main>
  );
}
