import { NextResponse } from "next/server";
import { z } from "zod";
import { claimBody, ensureChangeable, fail, findByClaim } from "@/lib/claim-api";
import { getAvailableSlots } from "@/lib/slots";

export const dynamic = "force-dynamic";

/** Horarios disponibles para reprogramar: mismo barbero y servicio, sin contar el propio turno como ocupado. */
export async function POST(req: Request) {
  const parsed = claimBody.extend({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Datos inválidos.", 400);

  const found = await findByClaim(req, parsed.data.slug, parsed.data.code);
  if ("response" in found) return found.response;
  const { business, appt } = found;

  const ok = ensureChangeable(business, appt);
  if ("response" in ok) return ok.response;
  if (!appt.barberId) return fail("El barbero de este turno ya no está disponible. Comunicate con la barbería.", 409);

  const slots = await getAvailableSlots({
    businessId: business.id,
    barberId: appt.barberId,
    serviceId: appt.serviceId,
    date: parsed.data.date,
    excludeAppointmentId: appt.id,
    durationMin: Math.round((appt.endAt.getTime() - appt.startAt.getTime()) / 60_000), // conserva el largo reservado
  });
  return NextResponse.json({ slots, timezone: business.timezone });
}
