import { NextResponse } from "next/server";
import { z } from "zod";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { prisma, getBusinessBySlug } from "@/lib/db";
import { getAvailableSlots } from "@/lib/slots";
import { effectiveDuration } from "@/lib/learned-duration";

const schema = z.object({
  slug: z.string().min(1).max(60),
  serviceId: z.string().min(1),
  barberId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Opcional: si el cliente ya dio su WhatsApp, los horarios se calculan con su tiempo personalizado. */
  phone: z.string().max(25).optional(),
});

export async function GET(req: Request) {
  const parsed = schema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });

  const { slug, phone, ...q } = parsed.data;
  const business = await getBusinessBySlug(slug);
  if (!business) return NextResponse.json({ error: "Negocio inexistente" }, { status: 404 });

  // Tiempo del cliente (solo si el negocio lo activó y el número es válido). Si no, la duración normal del servicio.
  let durationMin: number | undefined;
  let adjusted = false;
  const e164 = business.learnDurations && phone ? parsePhoneNumberFromString(phone) : null;
  if (e164?.isValid()) {
    const service = await prisma.service.findFirst({ where: { id: q.serviceId, businessId: business.id, active: true, comingSoon: false }, select: { durationMin: true } });
    if (service) {
      const eff = await effectiveDuration({ businessId: business.id, serviceId: q.serviceId, standardMin: service.durationMin, phone: e164.number, learn: true });
      durationMin = eff.minutes;
      adjusted = eff.minutes !== service.durationMin;
    }
  }

  const slots = await getAvailableSlots({ businessId: business.id, ...q, durationMin });
  return NextResponse.json({ slots, timezone: business.timezone, durationMin: durationMin ?? null, adjusted });
}
