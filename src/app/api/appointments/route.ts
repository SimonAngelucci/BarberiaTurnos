import { NextResponse, after } from "next/server";
import { z } from "zod";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { DateTime } from "luxon";
import { prisma, getBusinessBySlug } from "@/lib/db";
import { isSlotAvailable } from "@/lib/slots";
import { enqueueBookingMessages, dispatchDue } from "@/lib/outbox";

const schema = z.object({
  slug: z.string().min(1).max(60),
  serviceId: z.string().min(1),
  barberId: z.string().min(1),
  startAt: z.string().datetime(),
  firstName: z.string().trim().min(2, "Nombre muy corto").max(60),
  lastName: z.string().trim().min(2, "Apellido muy corto").max(60),
  phone: z.string().trim().min(6).max(25),
});

const isOverlapError = (e: unknown) => {
  const msg = String((e as Error)?.message ?? e);
  return msg.includes("appointment_no_overlap") || msg.includes("23P01");
};

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }
  const d = parsed.data;

  const phone = parsePhoneNumberFromString(d.phone);
  if (!phone?.isValid()) {
    return NextResponse.json({ error: "Número de WhatsApp inválido. Incluí el código de país (ej: +54 9 11 1234 5678)." }, { status: 400 });
  }

  const business = await getBusinessBySlug(d.slug);
  if (!business) return NextResponse.json({ error: "Barbería inexistente" }, { status: 404 });
  const service = await prisma.service.findFirst({ where: { id: d.serviceId, businessId: business.id, active: true } });
  if (!service) return NextResponse.json({ error: "Servicio no disponible" }, { status: 400 });

  const startAt = new Date(d.startAt);
  const endAt = DateTime.fromJSDate(startAt).plus({ minutes: service.durationMin }).toJSDate();

  // 1ª defensa: el horario está dentro de la agenda y libre.
  const ok = await isSlotAvailable({ businessId: business.id, barberId: d.barberId, serviceId: d.serviceId, startAt });
  if (!ok) return NextResponse.json({ error: "Ese horario ya no está disponible. Elegí otro." }, { status: 409 });

  try {
    // 2ª defensa: la constraint de Postgres rechaza solapamientos aunque dos requests lleguen a la vez.
    const appt = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.upsert({
        where: { businessId_phone: { businessId: business.id, phone: phone.number } },
        update: { firstName: d.firstName, lastName: d.lastName },
        create: { businessId: business.id, phone: phone.number, firstName: d.firstName, lastName: d.lastName },
      });
      return tx.appointment.create({
        data: {
          businessId: business.id,
          barberId: d.barberId,
          serviceId: service.id,
          customerId: customer.id,
          startAt,
          endAt,
          priceCents: service.priceCents,
        },
      });
    });

    await enqueueBookingMessages(appt.id);
    after(() => dispatchDue().catch((e) => console.error("dispatch", e)));

    return NextResponse.json({ id: appt.id }, { status: 201 });
  } catch (e) {
    if (isOverlapError(e)) {
      return NextResponse.json({ error: "Alguien acaba de reservar ese horario. Elegí otro." }, { status: 409 });
    }
    console.error("create appointment", e);
    return NextResponse.json({ error: "No pudimos crear el turno. Intentá de nuevo." }, { status: 500 });
  }
}
