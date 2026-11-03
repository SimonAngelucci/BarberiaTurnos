import { notFound } from "next/navigation";
import { getBusinessBySlug } from "@/lib/db";
import { ClaimFlow } from "@/components/ClaimFlow";

export const dynamic = "force-dynamic";

/** «Mi turno»: el cliente ingresa su código de reclamo para reprogramar o cancelar. */
export default async function ManageAppointmentPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ c?: string }> }) {
  const { slug } = await params;
  const { c } = await searchParams;
  const b = await getBusinessBySlug(slug);
  if (!b) notFound();

  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 py-10">
      <header className="mb-6 text-center">
        {b.logoUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={b.logoUrl} alt={b.name} className="mx-auto mb-3 h-16 w-16 rounded-full bg-white object-cover shadow" />}
        <h1 className="text-xl font-bold">{b.name}</h1>
      </header>
      <ClaimFlow slug={b.slug} timezone={b.timezone} maxAdvanceDays={Math.min(b.maxAdvanceDays, 60)} initialCode={(c ?? "").slice(0, 20)} enabled={b.allowClientChanges} />
    </main>
  );
}
