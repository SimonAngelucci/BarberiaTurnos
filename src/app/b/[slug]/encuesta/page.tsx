import { notFound } from "next/navigation";
import { prisma, getBusinessBySlug } from "@/lib/db";
import { SurveyForm } from "@/components/SurveyForm";

export const dynamic = "force-dynamic";

/** Encuesta posterior al turno (enlace secreto que llega por WhatsApp). */
export default async function SurveyPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ t?: string }> }) {
  const { slug } = await params;
  const { t } = await searchParams;
  const b = await getBusinessBySlug(slug);
  if (!b || !b.learnDurations) notFound();

  const token = /^[0-9a-f]{32}$/.test(t ?? "") ? t! : null;
  const appt = token
    ? await prisma.appointment.findFirst({
        where: { surveyToken: token, businessId: b.id, status: { in: ["CONFIRMED", "COMPLETED"] }, startAt: { lte: new Date() } },
        select: { actualDurationMin: true, service: { select: { name: true } } },
      })
    : null;

  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 py-10">
      <header className="mb-6 text-center">
        {b.logoUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={b.logoUrl} alt={b.name} className="mx-auto mb-3 h-16 w-16 rounded-full bg-white object-cover shadow" />}
        <h1 className="text-xl font-bold">{b.name}</h1>
      </header>
      {token && appt ? (
        <SurveyForm slug={b.slug} token={token} serviceName={appt.service.name} initial={appt.actualDurationMin} />
      ) : (
        <div className="card text-center text-sm text-neutral-600">Este enlace no es válido o el turno todavía no ocurrió.</div>
      )}
    </main>
  );
}
