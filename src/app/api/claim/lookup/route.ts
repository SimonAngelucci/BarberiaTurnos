import { NextResponse } from "next/server";
import { changePolicy } from "@/lib/claim";
import { claimBody, fail, findByClaim } from "@/lib/claim-api";
import { noticePhrase } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Paso 1 del cliente: ingresa el código y ve su turno, y si todavía puede modificarlo. */
export async function POST(req: Request) {
  const parsed = claimBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Ingresá tu código de reclamo.", 400);

  const found = await findByClaim(req, parsed.data.slug, parsed.data.code);
  if ("response" in found) return found.response;
  const { business, appt, code } = found;

  const policy = changePolicy(business, appt);
  return NextResponse.json({
    code,
    appointment: {
      serviceName: appt.service.name,
      barberName: appt.barber?.name ?? null,
      customerFirstName: appt.customer.firstName,
      startAt: appt.startAt.toISOString(),
      durationMin: Math.round((appt.endAt.getTime() - appt.startAt.getTime()) / 60_000),
      status: appt.status,
      paidCents: appt.amountPaidCents,
    },
    canChange: policy.ok,
    reason: policy.ok ? null : policy.error,
    deadline: policy.ok ? policy.deadline.toISOString() : null,
    notice: noticePhrase(business.changeMinNoticeMin),
  });
}
