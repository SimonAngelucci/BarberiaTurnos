import { NextResponse, after } from "next/server";
import { z } from "zod";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { DateTime } from "luxon";
import { prisma, getBusinessForCheckout } from "@/lib/db";
import { isSlotAvailable } from "@/lib/slots";
import { enqueueBookingMessages, dispatchDue } from "@/lib/outbox";
import { generateClaimCode } from "@/lib/claim";
import { payOptions } from "@/lib/payment-math";
import { payConfig, createCheckout, expirePendingPayments, siteOrigin } from "@/lib/payments";

const schema = z.object({
  slug: z.string().min(1).max(60),
  serviceId: z.string().min(1),
  barberId: z.string().min(1),
  startAt: z.string().datetime(),
  firstName: z.string().trim().min(2, "Nombre muy corto").max(60),
  lastName: z.string().trim().min(2, "Apellido muy corto").max(60),
  phone: z.string().trim().min(6).max(25),
  /** Lo que el cliente QUIERE hacer; el servidor valida que la barbería lo permita y calcula el monto. */
  payment: z.enum(["NONE", "DEPOSIT", "FULL"]).default("NONE"),
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

  const business = await getBusinessForCheckout(d.slug); // incluye el token cifrado: solo se usa acá, en el servidor
  if (!business) return NextResponse.json({ error: "Barbería inexistente" }, { status: 404 });
  const service = await prisma.service.findFirst({ where: { id: d.serviceId, businessId: business.id, active: true } });
  if (!service) return NextResponse.json({ error: "Servicio no disponible" }, { status: 400 });

  const startAt = new Date(d.startAt);
  const endAt = DateTime.fromJSDate(startAt).plus({ minutes: service.durationMin }).toJSDate();

  // Opción de pago: se valida contra la configuración de la barbería. El monto lo calcula el servidor.
  const options = payOptions(service.priceCents, payConfig(business));
  const chosen = options.find((o) => o.choice === d.payment);
  if (!chosen) {
    const needsPayment = !options.some((o) => o.choice === "NONE");
    return NextResponse.json(
      { error: needsPayment ? "Esta barbería requiere pagar online para reservar." : "Esa opción de pago no está disponible." },
      { status: 400 },
    );
  }
  const online = chosen.choice !== "NONE";

  // Libera horarios retenidos cuyo plazo de pago venció (si no, la restricción de la base los seguiría bloqueando).
  await expirePendingPayments(business.id);

  // 1ª defensa: el horario está dentro de la agenda y libre.
  const ok = await isSlotAvailable({ businessId: business.id, barberId: d.barberId, serviceId: d.serviceId, startAt });
  if (!ok) return NextResponse.json({ error: "Ese horario ya no está disponible. Elegí otro." }, { status: 409 });

  try {
    // 2ª defensa: la constraint de Postgres rechaza solapamientos aunque dos requests lleguen a la vez.
    const { appt, payment } = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.upsert({
        where: { businessId_phone: { businessId: business.id, phone: phone.number } },
        update: { firstName: d.firstName, lastName: d.lastName },
        create: { businessId: business.id, phone: phone.number, firstName: d.firstName, lastName: d.lastName },
      });
      const created = await tx.appointment.create({
        data: {
          businessId: business.id,
          barberId: d.barberId,
          serviceId: service.id,
          customerId: customer.id,
          startAt,
          endAt,
          priceCents: service.priceCents,
          // Pago online: el horario queda retenido (PENDING_PAYMENT) hasta que Mercado Pago apruebe el cobro.
          status: online ? "PENDING_PAYMENT" : "CONFIRMED",
          // Código para reprogramar/cancelar (único por restricción de la base) + primer evento del historial.
          claimCode: generateClaimCode(),
          events: { create: { businessId: business.id, kind: "CREATED", actor: "CLIENT", toStartAt: startAt } },
          // Pudo pagar online y eligió el local: queda "Pago pendiente en el local". Sin pagos online, no se marca nada.
          ...(!online && options.some((o) => o.choice !== "NONE") ? { paymentStatus: "PENDING_AT_STORE" as const } : {}),
        },
      });
      const payment = online
        ? await tx.payment.create({
            data: {
              businessId: business.id,
              appointmentId: created.id,
              kind: chosen.choice === "FULL" ? "FULL" : "DEPOSIT",
              amountCents: chosen.amountCents,
            },
          })
        : null;
      return { appt: created, payment };
    }, { timeout: 20_000, maxWait: 10_000 });

    if (!online || !payment) {
      await enqueueBookingMessages(appt.id);
      after(() => dispatchDue().catch((e) => console.error("dispatch", e)));
      return NextResponse.json({ id: appt.id, claimCode: appt.claimCode }, { status: 201 });
    }

    // Checkout Pro: si no se puede crear el cobro, se libera el horario y se avisa.
    try {
      const co = await createCheckout(business, appt, payment, service.name, siteOrigin(req));
      await prisma.payment.update({ where: { id: payment.id }, data: { mpPreferenceId: co.preferenceId } });
      return NextResponse.json({ id: appt.id, checkoutUrl: co.url }, { status: 201 });
    } catch (e) {
      console.error("mercadopago preference", e);
      await prisma.$transaction([
        prisma.appointment.updateMany({ where: { id: appt.id }, data: { status: "CANCELLED" } }),
        prisma.payment.updateMany({ where: { id: payment.id }, data: { state: "CANCELLED" } }),
      ]);
      return NextResponse.json({ error: "No pudimos iniciar el pago. Probá de nuevo o elegí pagar después." }, { status: 502 });
    }
  } catch (e) {
    if (isOverlapError(e)) {
      return NextResponse.json({ error: "Alguien acaba de reservar ese horario. Elegí otro." }, { status: 409 });
    }
    console.error("create appointment", e);
    return NextResponse.json({ error: "No pudimos crear el turno. Intentá de nuevo." }, { status: 500 });
  }
}
