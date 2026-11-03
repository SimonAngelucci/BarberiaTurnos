import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/db";
import { claimBody, ensureChangeable, fail, findByClaim } from "@/lib/claim-api";
import { buildSelfCancelOps, dispatchDue } from "@/lib/outbox";

export const dynamic = "force-dynamic";

/** El cliente cancela su turno con el código: se libera el horario, queda en el historial y se le avisa por WhatsApp. */
export async function POST(req: Request) {
  const parsed = claimBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Datos inválidos.", 400);

  const found = await findByClaim(req, parsed.data.slug, parsed.data.code);
  if ("response" in found) return found.response;
  const { business, appt } = found;

  const ok = ensureChangeable(business, appt);
  if ("response" in ok) return ok.response;

  const hadPayment = appt.amountPaidCents > 0;
  try {
    await prisma.$transaction([
      prisma.appointment.update({ where: { id: appt.id, status: "CONFIRMED" }, data: { status: "CANCELLED" } }),
      prisma.appointmentEvent.create({
        data: {
          businessId: business.id,
          appointmentId: appt.id,
          kind: "CANCELLED",
          actor: "CLIENT",
          fromStartAt: appt.startAt,
          note: hadPayment ? "Tenía un pago registrado: coordinar la devolución con el cliente." : null,
        },
      }),
      ...(await buildSelfCancelOps(appt.id)),
    ]);
  } catch (e) {
    if ((e as { code?: string })?.code === "P2025") return fail("Este turno ya fue modificado o cancelado.", 409);
    console.error("self cancel", e);
    return fail("No pudimos cancelar el turno. Intentá de nuevo.", 500);
  }

  after(() => dispatchDue().catch(console.error));
  return NextResponse.json({ ok: true, hadPayment });
}
