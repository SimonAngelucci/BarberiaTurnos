import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import { prisma, getBusinessBySlug } from "@/lib/db";
import { money } from "@/lib/format";
import { blocked, recordFailure } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <dt className="text-sm text-neutral-500">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

/** Página de turno confirmado: se llega con el código del turno (que solo conoce quien reservó). */
export default async function ConfirmedPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ c?: string }> }) {
  const { slug } = await params;
  const code = ((await searchParams).c ?? "").trim().toUpperCase().slice(0, 20);
  const b = await getBusinessBySlug(slug);
  if (!b) notFound();

  const h = await headers();
  const key = `confirmed:${(h.get("x-forwarded-for") ?? "local").split(",")[0].trim()}`;
  const appt =
    code && !blocked(key, 20, 10 * 60_000)
      ? await prisma.appointment.findFirst({
          where: { businessId: b.id, claimCode: code, status: { in: ["CONFIRMED", "COMPLETED", "PENDING_PAYMENT"] } },
          include: { service: true, barber: true, customer: true },
        })
      : null;
  if (code && !appt) recordFailure(key, 10 * 60_000);

  const profile = appt ? await prisma.businessProfile.findUnique({ where: { businessId: b.id }, select: { address: true } }) : null;
  const home = `/b/${b.slug}`;

  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 py-10">
      <header className="mb-6 text-center">
        {b.logoUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={b.logoUrl} alt={b.name} className="mx-auto mb-3 h-16 w-16 rounded-full bg-white object-cover shadow" />}
        <h1 className="text-xl font-bold">{b.name}</h1>
      </header>

      {!appt ? (
        <div className="card space-y-3 text-center">
          <p className="text-sm text-neutral-600">No encontramos ese turno. Si recién reservaste, revisá el WhatsApp de confirmación.</p>
          <Link href={home} className="btn w-full">
            Volver a la página
          </Link>
        </div>
      ) : (
        (() => {
          const local = DateTime.fromJSDate(appt.startAt).setZone(b.timezone).setLocale("es");
          const mins = Math.round((appt.endAt.getTime() - appt.startAt.getTime()) / 60_000);
          const pendingPay = appt.paymentStatus === "PENDING_AT_STORE";
          return (
            <div className="space-y-4">
              <div className="card text-center">
                <div className="mb-2 text-5xl" aria-hidden>
                  ✅
                </div>
                <h2 className="text-2xl font-bold">¡Turno confirmado!</h2>
                <p className="mt-1 text-neutral-600">Gracias, {appt.customer.firstName}. Te esperamos.</p>
              </div>

              <div className="card">
                <dl className="divide-y divide-neutral-100">
                  <Row label="Fecha">
                    <span className="capitalize">{local.toFormat("cccc d 'de' LLLL")}</span>
                  </Row>
                  <Row label="Hora">
                    {local.toFormat("HH:mm")} hs <span className="font-normal text-neutral-500">({mins} min)</span>
                  </Row>
                  <Row label="Servicio">{appt.service.name}</Row>
                  {appt.barber && <Row label="Barbero">{appt.barber.name}</Row>}
                  <Row label="Precio">{money(appt.priceCents, b.currency)}</Row>
                  {appt.amountPaidCents > 0 && <Row label="Pagado online">{money(appt.amountPaidCents, b.currency)}</Row>}
                  {pendingPay && <Row label="Pago">Se abona en el local</Row>}
                  {profile?.address && <Row label="Dirección">{profile.address}</Row>}
                  <Row label="A nombre de">
                    {appt.customer.firstName} {appt.customer.lastName}
                  </Row>
                </dl>
              </div>

              {b.allowClientChanges && appt.claimCode && (
                <div className="card space-y-2 text-center">
                  <div className="text-xs text-neutral-500">Tu código para reprogramar o cancelar</div>
                  <div className="font-mono text-2xl font-bold tracking-widest">{appt.claimCode}</div>
                  <p className="text-xs text-neutral-500">Guardalo: también te lo enviamos por WhatsApp.</p>
                  <Link href={`/b/${b.slug}/turno?c=${encodeURIComponent(appt.claimCode)}`} className="btn-ghost w-full">
                    Reprogramar o cancelar
                  </Link>
                </div>
              )}

              <p className="text-center text-sm text-neutral-500">Te enviamos la confirmación por WhatsApp y te vamos a recordar antes del turno.</p>
              <Link href={home} className="btn-ghost w-full">
                Volver a la página
              </Link>
            </div>
          );
        })()
      )}
    </main>
  );
}
