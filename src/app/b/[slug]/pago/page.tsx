import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { DateTime } from "luxon";
import { prisma } from "@/lib/db";
import { verifySignedId } from "@/lib/crypto";
import { money } from "@/lib/format";
import { dispatchDue } from "@/lib/outbox";
import { expirePendingPayments, payConfig, syncMpPayment } from "@/lib/payments";
import { HOLD_MINUTES } from "@/lib/payment-math";
import { PaymentPoller } from "@/components/PaymentPoller";
import { RetryPaymentButton } from "@/components/RetryPaymentButton";
import type { PaymentState } from "@prisma/client";

export const dynamic = "force-dynamic";

type SP = { a?: string; t?: string; payment_id?: string; collection_id?: string };

/** Destino de las back_urls de Mercado Pago. Nunca confía en el `status` de la URL: lo verifica con la API. */
export default async function PaymentReturnPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  if (!sp.a || !verifySignedId("appt", sp.a, sp.t)) notFound();

  const load = () =>
    prisma.appointment.findUnique({ where: { id: sp.a! }, include: { business: { omit: { mpAccessToken: true } }, service: true, payments: { select: { state: true } } } });
  let appt = await load();
  if (!appt || appt.business.slug !== slug) notFound();

  const mpId = sp.payment_id ?? sp.collection_id;
  let mpState: PaymentState | null = null; // estado real del pago según Mercado Pago
  if (mpId && appt.status === "PENDING_PAYMENT") {
    try {
      const r = await syncMpPayment(appt.businessId, mpId);
      mpState = r?.state ?? null;
      if (r?.confirmedNow) after(() => dispatchDue().catch(console.error));
    } catch (e) {
      console.error("sync on return", e); // el webhook lo resolverá
    }
  }
  if (appt.status === "PENDING_PAYMENT") await expirePendingPayments(appt.businessId);
  appt = (await load())!;

  const b = appt.business;
  const when = DateTime.fromJSDate(appt.startAt).setZone(b.timezone).setLocale("es");
  const paid = appt.status === "CONFIRMED" && (appt.paymentStatus === "PAID" || appt.paymentStatus === "DEPOSIT_PAID");
  const pending = appt.status === "PENDING_PAYMENT";
  // Pago en curso en Mercado Pago (ej. en revisión): no se ofrece reintentar para no cobrar dos veces.
  const inProcess = pending && !!mpId && mpState === "PENDING";
  const canRetry = payConfig(b).enabled && appt.payments.length > 0 && !appt.payments.some((p) => p.state === "APPROVED") && (appt.status === "PENDING_PAYMENT" || appt.status === "CANCELLED");
  const minutesLeft = Math.max(0, HOLD_MINUTES - Math.floor((Date.now() - appt.createdAt.getTime()) / 60_000));

  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 py-10">
      <header className="mb-6 text-center">
        {b.logoUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={b.logoUrl} alt={b.name} className="mx-auto mb-3 h-16 w-16 rounded-full bg-white object-cover shadow" />}
        <h1 className="text-xl font-bold">{b.name}</h1>
      </header>

      <div className="card space-y-3 text-center">
        {paid ? (
          <>
            <div className="text-4xl">✅</div>
            <h2 className="text-xl font-bold">¡Pago recibido! Turno confirmado</h2>
            <p className="text-neutral-600">
              {appt.service.name} · {when.toFormat("cccc d 'de' LLLL")} a las {when.toFormat("HH:mm")}
            </p>
            <p className="text-sm text-neutral-500">
              Pagaste {money(appt.amountPaidCents, b.currency)}
              {appt.paymentStatus === "DEPOSIT_PAID" ? ` (seña). El resto (${money(appt.priceCents - appt.amountPaidCents, b.currency)}) lo abonás en el local.` : "."}{" "}
              Te enviamos la confirmación por WhatsApp.
            </p>
          </>
        ) : pending && !inProcess ? (
          <>
            <div className="text-4xl">⚠️</div>
            <h2 className="text-xl font-bold">No se completó el pago</h2>
            <p className="text-sm text-neutral-500">
              Tu turno de {appt.service.name} del {when.toFormat("cccc d 'de' LLLL")} a las {when.toFormat("HH:mm")} sigue reservado
              {minutesLeft > 0 ? ` ${minutesLeft} min más` : " unos instantes"}. No se te cobró nada.
            </p>
            {canRetry && <RetryPaymentButton a={sp.a} t={sp.t!} />}
            <Link href={`/b/${slug}`} className="btn-ghost w-full">
              Elegir otro horario
            </Link>
          </>
        ) : pending ? (
          <>
            <div className="text-4xl">⏳</div>
            <h2 className="text-xl font-bold">Estamos confirmando tu pago…</h2>
            <p className="text-sm text-neutral-500">
              Si ya pagaste, puede tardar unos segundos. Esta pantalla se actualiza sola. Tu horario está reservado por unos minutos.
            </p>
            <PaymentPoller a={sp.a} t={sp.t!} />
          </>
        ) : appt.status === "CONFIRMED" ? (
          <>
            <div className="text-4xl">✅</div>
            <h2 className="text-xl font-bold">Turno confirmado</h2>
            <p className="text-neutral-600">
              {appt.service.name} · {when.toFormat("cccc d 'de' LLLL")} a las {when.toFormat("HH:mm")}
            </p>
          </>
        ) : (
          <>
            <div className="text-4xl">⚠️</div>
            <h2 className="text-xl font-bold">No se completó el pago</h2>
            <p className="text-sm text-neutral-500">No se te cobró nada y el horario fue liberado. Podés reintentar si todavía está disponible, o reservar de nuevo.</p>
            {canRetry && <RetryPaymentButton a={sp.a} t={sp.t!} />}
            <Link href={`/b/${slug}`} className={canRetry ? "btn-ghost w-full" : "btn w-full"}>
              {canRetry ? "Elegir otro horario" : "Volver a reservar"}
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
