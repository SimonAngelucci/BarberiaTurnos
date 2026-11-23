import { notFound } from "next/navigation";
import { getBusinessBySlug } from "@/lib/db";
import { ClaimFlow } from "@/components/ClaimFlow";
import { PublicHeader } from "@/components/site/PublicHeader";

export const dynamic = "force-dynamic";

/** «Mi turno»: el cliente ingresa su código de reclamo para reprogramar o cancelar. */
export default async function ManageAppointmentPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ c?: string }> }) {
  const { slug } = await params;
  const { c } = await searchParams;
  const b = await getBusinessBySlug(slug);
  if (!b) notFound();

  return (
    <main className="mx-auto min-h-screen max-w-[480px]">
      <PublicHeader name={b.name} logoUrl={b.logoUrl} title="Mi turno" back={{ href: `/b/${b.slug}`, label: "Volver a la página" }} />
      <div className="px-4 py-6">
      <ClaimFlow slug={b.slug} timezone={b.timezone} maxAdvanceDays={Math.min(b.maxAdvanceDays, 60)} initialCode={(c ?? "").slice(0, 20)} enabled={b.allowClientChanges} />
      </div>
    </main>
  );
}
