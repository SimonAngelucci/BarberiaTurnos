"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { DateTime } from "luxon";
import { z } from "zod";
import { prisma, getBusinessById } from "@/lib/db";
import { requireWritable } from "@/lib/guard";
import { getAccess } from "@/lib/billing";
import { enqueueCancellation, buildCancellationOps, dispatchDue } from "@/lib/outbox";
import { hhmmToMin } from "@/lib/format";
import { isIconKey, BUSINESS_TYPES } from "@/lib/service-icons";
import { FEATURES } from "@/lib/features";
import { deleteImage, isOwnBlobUrl } from "@/lib/upload";
import { encryptSecret } from "@/lib/crypto";
import { configSchema } from "@/lib/page-config";
import type { Prisma } from "@prisma/client";
import { verifyMpToken } from "@/lib/payments";
import { isBarberColor } from "@/lib/barber-colors";
import { generateClaimCode } from "@/lib/claim";
import { loadRules } from "@/lib/discount-db";
import { priceFor } from "@/lib/discounts";
import { isSlotAvailable } from "@/lib/slots";
import { phoneVariants } from "@/lib/phone-key";
import { enqueueBookingMessages } from "@/lib/outbox";
import { parsePhoneNumberFromString } from "libphonenumber-js";

// Todas las actions son endpoints públicos: SIEMPRE validar sesión y datos.

export async function cancelAppointment(formData: FormData) {
  const { businessId } = await requireWritable();
  const id = z.string().min(1).parse(formData.get("id"));

  const before = await prisma.appointment.findFirst({ where: { id, businessId, status: "CONFIRMED" }, select: { startAt: true } });
  const res = await prisma.appointment.updateMany({
    where: { id, businessId, status: "CONFIRMED" },
    data: { status: "CANCELLED" },
  });
  if (res.count > 0) {
    await prisma.appointmentEvent.create({ data: { businessId, appointmentId: id, kind: "CANCELLED", actor: "ADMIN", fromStartAt: before?.startAt ?? null } });
    await enqueueCancellation(id);
    after(() => dispatchDue().catch(console.error));
  }
  revalidatePath("/admin");
}

export async function setAppointmentStatus(formData: FormData) {
  const { businessId } = await requireWritable();
  const id = z.string().min(1).parse(formData.get("id"));
  const status = z.enum(["COMPLETED", "NO_SHOW"]).parse(formData.get("status"));
  await prisma.appointment.updateMany({ where: { id, businessId, status: "CONFIRMED" }, data: { status } });
  revalidatePath("/admin");
}

export type CreateApptResult = { ok: true } | { ok: false; error: string };

/**
 * Crea un turno desde la agenda (el administrador toca un hueco libre). Solo en horarios que el negocio ofrece y siguen libres:
 * es la misma validación que usa la reserva online. Queda confirmado, con pago pendiente en el local.
 */
export async function createAdminAppointment(input: { barberId: string; serviceId: string; startAt: string; firstName: string; lastName: string; phone: string }): Promise<CreateApptResult> {
  const { businessId } = await requireWritable();
  const p = z
    .object({
      barberId: z.string().min(1),
      serviceId: z.string().min(1),
      startAt: z.string().min(1),
      firstName: z.string().trim().min(2, "Nombre muy corto").max(60),
      lastName: z.string().trim().max(60),
      phone: z.string().trim().min(6).max(25),
    })
    .safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Datos inválidos" };
  const d = p.data;
  const phone = parsePhoneNumberFromString(d.phone);
  if (!phone?.isValid()) return { ok: false, error: "WhatsApp inválido. Incluí el código de país (ej: +54 9 11 1234 5678)." };

  const [service, barber] = await Promise.all([
    prisma.service.findFirst({ where: { id: d.serviceId, businessId, active: true, comingSoon: false } }),
    prisma.barber.findFirst({ where: { id: d.barberId, businessId, active: true } }),
  ]);
  if (!service || !barber) return { ok: false, error: "Servicio o profesional no disponible" };

  const startAt = new Date(d.startAt);
  if (!(await isSlotAvailable({ businessId, barberId: barber.id, serviceId: service.id, startAt }))) return { ok: false, error: "Ese horario ya no está disponible." };
  const endAt = DateTime.fromJSDate(startAt).plus({ minutes: service.durationMin }).toJSDate();
  // Mismas promociones automáticas que la reserva online (sin cupón): el precio guardado es el que realmente se cobra.
  const biz = await getBusinessById(businessId);
  const price = priceFor({ rules: await loadRules(businessId), serviceId: service.id, priceCents: service.priceCents, startAt, tz: biz.timezone });

  try {
    const appt = await prisma.$transaction(async (tx) => {
      const existing = await tx.customer.findFirst({ where: { businessId, phone: { in: phoneVariants(phone.number) } }, orderBy: { createdAt: "asc" } });
      const customer = existing ?? (await tx.customer.create({ data: { businessId, phone: phone.number, firstName: d.firstName, lastName: d.lastName || "-" } }));
      return tx.appointment.create({
        data: {
          businessId,
          barberId: barber.id,
          serviceId: service.id,
          customerId: customer.id,
          startAt,
          endAt,
          priceCents: price.finalCents,
          originalPriceCents: price.discountCents > 0 ? price.originalCents : null,
          discountCents: price.discountCents,
          discountId: price.discount?.id ?? null,
          status: "CONFIRMED",
          claimCode: generateClaimCode(),
          events: { create: { businessId, kind: "CREATED", actor: "ADMIN", toStartAt: startAt } },
        },
      });
    });
    await enqueueBookingMessages(appt.id);
    after(() => dispatchDue().catch(console.error));
  } catch (e) {
    if (/appointment_one_per_start|appointment_no_overlap|23505|23P01|Unique constraint/i.test(String((e as Error)?.message ?? e))) return { ok: false, error: "Ese horario se ocupó recién." };
    console.error("createAdminAppointment", e);
    return { ok: false, error: "No se pudo crear el turno." };
  }
  revalidatePath("/admin/turnos");
  revalidatePath("/admin");
  return { ok: true };
}

const serviceSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(200).optional(),
  price: z.coerce.number().min(0),
  durationMin: z.coerce.number().int().min(5).max(480),
});

export async function saveService(formData: FormData) {
  const { businessId } = await requireWritable();
  const id = formData.get("id")?.toString();
  const d = serviceSchema.parse(Object.fromEntries(formData));
  const data = {
    name: d.name,
    description: d.description || null,
    priceCents: Math.round(d.price * 100),
    durationMin: d.durationMin,
    comingSoon: formData.get("comingSoon") === "on",
  };
  // Ícono: una clave de la lista, o una imagen propia ya subida desde el formulario (/api/admin/upload).
  const iconKey = isIconKey(formData.get("iconKey")?.toString()) ? formData.get("iconKey")!.toString() : null;
  const newIcon = formData.get("iconUrl")?.toString() ?? "";
  if (newIcon && !isOwnBlobUrl(newIcon, businessId)) throw new Error("Imagen inválida");
  const picked = formData.get("iconPick") === "1";

  if (id) {
    const current = await prisma.service.findFirst({ where: { id, businessId }, select: { iconUrl: true, iconKey: true } });
    if (!current) throw new Error("Servicio no encontrado");
    let iconUrl = current.iconUrl;
    let key = current.iconKey;
    if (newIcon && newIcon !== iconUrl) {
      await deleteImage(iconUrl);
      iconUrl = newIcon;
    } else if (formData.get("removeIcon") === "on" || (picked && iconUrl)) {
      await deleteImage(iconUrl);
      iconUrl = null;
    }
    if (picked) key = iconKey;
    await prisma.service.updateMany({ where: { id, businessId }, data: { ...data, iconKey: key, iconUrl, active: formData.get("active") === "on" } });
  } else {
    await prisma.service.create({ data: { ...data, businessId, iconKey: picked ? iconKey : null, iconUrl: newIcon || null } });
  }
  revalidatePath("/admin/services");
  revalidatePath("/", "layout");
}

/** Rubro del negocio: cambia los íconos sugeridos (los servicios con un ícono que no es del rubro siguen mostrándolo). */
export async function saveBusinessType(formData: FormData) {
  const { businessId } = await requireWritable();
  const type = z.enum(Object.keys(BUSINESS_TYPES) as [keyof typeof BUSINESS_TYPES, ...(keyof typeof BUSINESS_TYPES)[]]).parse(formData.get("businessType"));
  await prisma.business.update({ where: { id: businessId }, data: { businessType: type } });
  revalidatePath("/admin/services");
  revalidatePath("/", "layout");
}

/**
 * Elimina un servicio: si nunca tuvo turnos se borra de verdad (y su ícono propio); si tiene historial se marca como
 * eliminado (archived) para conservar los turnos pasados. En los dos casos desaparece de la lista y de la página pública.
 */
export async function archiveService(formData: FormData) {
  const { businessId } = await requireWritable();
  const id = z.string().min(1).parse(formData.get("id"));
  const s = await prisma.service.findFirst({ where: { id, businessId }, select: { iconUrl: true, _count: { select: { appointments: true } } } });
  if (!s) return;
  if (s._count.appointments === 0) {
    await prisma.service.deleteMany({ where: { id, businessId } });
    await deleteImage(s.iconUrl);
  } else {
    await prisma.service.updateMany({ where: { id, businessId }, data: { archived: true, active: false } });
  }
  revalidatePath("/admin/services");
  revalidatePath("/", "layout");
}

const barberSchema = z.object({
  name: z.string().trim().min(1, "Poné un nombre").max(60),
  bio: z.string().trim().max(400),
});

/** Crea o edita un barbero (nombre, foto, descripción). Con `id` edita; sin `id` crea. */
export async function saveBarber(formData: FormData) {
  const { businessId } = await requireWritable();
  const id = formData.get("id")?.toString() || undefined;
  const d = barberSchema.parse({ name: formData.get("name"), bio: formData.get("bio") ?? "" });

  const existing = id ? await prisma.barber.findFirst({ where: { id, businessId } }) : null;
  if (id && !existing) throw new Error("Profesional inexistente");

  // La foto ya se subió desde el formulario (/api/admin/upload); acá solo se acepta una URL propia de esta barbería.
  let photoUrl = existing?.photoUrl ?? null;
  const newPhoto = formData.get("photoUrl")?.toString() ?? "";
  if (formData.get("removePhoto") === "on") {
    await deleteImage(photoUrl);
    photoUrl = null;
  } else if (newPhoto && newPhoto !== photoUrl) {
    if (!isOwnBlobUrl(newPhoto, businessId)) throw new Error("Imagen inválida");
    await deleteImage(photoUrl);
    photoUrl = newPhoto;
  }

  const pickedColor = formData.get("color")?.toString();
  const data = { name: d.name, bio: d.bio || null, photoUrl, ...(isBarberColor(pickedColor) ? { color: pickedColor.toLowerCase() } : {}) };
  if (existing) {
    await prisma.barber.update({ where: { id: existing.id }, data: { ...data, active: formData.get("active") === "on" } });
  } else {
    // Tope de barberos del plan contratado (durante la prueba no hay tope).
    const { barberLimit } = await getAccess(businessId);
    if (barberLimit !== null && (await prisma.barber.count({ where: { businessId, active: true } })) >= barberLimit) {
      throw new Error(`Tu plan permite hasta ${barberLimit} profesionales. Cambiá de plan para agregar más.`);
    }
    await prisma.barber.create({ data: { ...data, businessId } });
  }
  revalidatePath("/admin/barbers");
  revalidatePath("/admin/schedule");
  revalidatePath("/", "layout");
}

export type DeleteBarberResult = { ok: true; cancelled: number } | { ok: false; error: string };

/**
 * Elimina un barbero de forma permanente.
 * - Sin turnos futuros: se borra directo.
 * - Con turnos futuros: exige `cancelFuture` explícito; los cancela, avisa a los clientes por WhatsApp
 *   y borra al barbero en UNA transacción (o se hace todo o no se hace nada).
 * - Turnos pasados: quedan en el historial con barberId = null.
 * Devuelve el error como dato (en producción Next oculta el mensaje de las excepciones).
 */
export async function deleteBarber(formData: FormData): Promise<DeleteBarberResult> {
  const { businessId } = await requireWritable();
  const id = z.string().min(1).parse(formData.get("id"));
  const cancelFuture = formData.get("cancelFuture") === "on";

  try {
    const barber = await prisma.barber.findFirst({ where: { id, businessId } });
    if (!barber) return { ok: false, error: "Ese profesional ya no existe." };

    const futureWhere = { barberId: id, businessId, status: "CONFIRMED" as const, startAt: { gt: new Date() } };
    const preview = await prisma.appointment.count({ where: futureWhere });
    if (preview > 0 && !cancelFuture) {
      return { ok: false, error: `Tiene ${preview} turno${preview === 1 ? "" : "s"} futuro${preview === 1 ? "" : "s"}. Confirmá que se cancelarán para poder eliminarlo.` };
    }

    // Deja de ofrecerse ya, así nadie puede reservarle un turno mientras se borra.
    await prisma.barber.update({ where: { id }, data: { active: false } });
    const ids = (await prisma.appointment.findMany({ where: futureWhere, select: { id: true } })).map((a) => a.id);

    await prisma.$transaction([
      prisma.appointment.updateMany({ where: { id: { in: ids }, status: "CONFIRMED" }, data: { status: "CANCELLED" } }),
      ...(await buildCancellationOps(ids)),
      ...(ids.length > 0
        ? [prisma.appointmentEvent.createMany({ data: ids.map((appointmentId) => ({ businessId, appointmentId, kind: "CANCELLED" as const, actor: "ADMIN" as const, note: "Profesional eliminado" })) })]
        : []),
      prisma.barber.delete({ where: { id } }),
    ]);

    await deleteImage(barber.photoUrl);
    if (ids.length > 0) after(() => dispatchDue().catch(console.error));
    revalidatePath("/admin/barbers");
    revalidatePath("/admin/schedule");
    revalidatePath("/admin");
    return { ok: true, cancelled: ids.length };
  } catch (e) {
    console.error("deleteBarber", e);
    return { ok: false, error: "No se pudo eliminar. Intentá de nuevo." };
  }
}

const MAX_TIMES_PER_DAY = 500;

/**
 * Guarda los horarios que el administrador cargó a mano para un profesional: por cada día (0=domingo … 6=sábado) llega la lista
 * `times_N` ("09:00,09:40,10:15"). Se guardan EXACTAMENTE esas horas (sin calcular, redondear ni validar contra la duración de
 * ningún servicio). Un día sin horarios queda sin turnos. Las reservas ya hechas no se tocan.
 */
export async function saveSchedule(formData: FormData) {
  const { businessId } = await requireWritable();
  const barberId = z.string().min(1).parse(formData.get("barberId"));
  const barber = await prisma.barber.findFirst({ where: { id: barberId, businessId } });
  if (!barber) throw new Error("Profesional inexistente");

  const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
  const rows: { barberId: string; weekday: number; startMin: number }[] = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    const list = String(formData.get(`times_${weekday}`) ?? "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    if (list.some((x) => !hhmm.test(x))) throw new Error("Horario inválido");
    const mins = [...new Set(list.map(hhmmToMin))];
    if (mins.length > MAX_TIMES_PER_DAY) throw new Error("Demasiados horarios en un día");
    for (const startMin of mins) rows.push({ barberId, weekday, startMin });
  }
  await prisma.$transaction([prisma.timeSlot.deleteMany({ where: { barberId } }), prisma.timeSlot.createMany({ data: rows })]);
  revalidatePath("/admin/schedule");
  revalidatePath("/", "layout");
}
export type FormState = { ok: boolean; message?: string; error?: string } | null;

const paymentSchema = z.object({
  mode: z.enum(["DEPOSIT_ONLY", "FULL_ONLY", "BOTH"]),
  depositType: z.enum(["PERCENT", "FIXED"]),
  depositValue: z.coerce.number().positive("Poné un valor de seña mayor a 0"),
  paymentTemplate: z.string().trim().min(1, "El mensaje de pago no puede estar vacío").max(600),
  accessToken: z.string().trim().max(400),
});

/** Configuración de pagos de la barbería. Devuelve el error como dato (Next oculta mensajes de excepciones). */
export async function savePaymentSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const { businessId } = await requireWritable();
  const parsed = paymentSchema.safeParse({
    mode: formData.get("mode"),
    depositType: formData.get("depositType"),
    depositValue: formData.get("depositValue"),
    paymentTemplate: formData.get("paymentTemplate"),
    accessToken: formData.get("accessToken") ?? "",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const d = parsed.data;

  let depositValue: number;
  if (d.depositType === "PERCENT") {
    if (!Number.isInteger(d.depositValue) || d.depositValue < 1 || d.depositValue > 100) return { ok: false, error: "El porcentaje de seña debe ser un entero entre 1 y 100" };
    depositValue = d.depositValue;
  } else {
    depositValue = Math.round(d.depositValue * 100); // pesos → centavos
    if (depositValue < 100 || depositValue > 100_000_000) return { ok: false, error: "El monto fijo de seña no es válido" };
  }

  try {
    // Único lugar del panel que lee el token (para saber si ya hay uno); no sale de esta función.
    const current = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { mpAccessToken: true, mpAccountLabel: true } });
    let mpAccessToken = current.mpAccessToken;
    let mpAccountLabel = current.mpAccountLabel;

    if (formData.get("removeToken") === "on") {
      mpAccessToken = null;
      mpAccountLabel = null;
    } else if (d.accessToken) {
      const check = await verifyMpToken(d.accessToken);
      if (!check.ok) return { ok: false, error: check.error };
      mpAccessToken = encryptSecret(d.accessToken);
      mpAccountLabel = check.label;
    }

    const wantsEnabled = formData.get("enabled") === "on";
    if (wantsEnabled && !mpAccessToken) return { ok: false, error: "Para activar los pagos cargá primero tu Access Token de Mercado Pago." };

    await prisma.business.update({
      where: { id: businessId },
      data: {
        paymentsEnabled: wantsEnabled && !!mpAccessToken,
        paymentMode: d.mode,
        depositType: d.depositType,
        depositValue,
        allowPayLater: formData.get("allowPayLater") === "on",
        paymentTemplate: d.paymentTemplate,
        mpAccessToken,
        mpAccountLabel,
      },
    });
    revalidatePath("/admin/payments");
    revalidatePath("/", "layout");
    return { ok: true, message: wantsEnabled ? "Pagos activados y guardados." : "Configuración guardada. Los pagos están desactivados." };
  } catch (e) {
    console.error("savePaymentSettings", e);
    return { ok: false, error: "No se pudo guardar. Intentá de nuevo." };
  }
}

/** Publica el diseño de la página pública. Se valida TODO en el servidor (rangos, fuentes, colores, estructura). */
export async function saveDesign(input: unknown): Promise<FormState> {
  const { businessId } = await requireWritable();
  // Defensa real: aunque alguien llame a la acción directamente, con el editor apagado no se guarda nada.
  if (!FEATURES.DESIGN_EDITOR) return { ok: false, error: "El editor de diseño no está disponible por ahora." };
  const parsed = configSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: `Diseño inválido: ${parsed.error.issues[0]?.message ?? "valores fuera de rango"}` };
  try {
    await prisma.business.update({ where: { id: businessId }, data: { pageConfig: parsed.data as Prisma.InputJsonValue } });
    revalidatePath("/", "layout");
    return { ok: true, message: "Diseño publicado. Ya se ve en tu link." };
  } catch (e) {
    console.error("saveDesign", e);
    return { ok: false, error: "No se pudo guardar. Intentá de nuevo." };
  }
}

/** Marca un turno como cobrado en el local (efectivo, transferencia, etc.). */
export async function markAppointmentPaid(formData: FormData) {
  const { businessId } = await requireWritable();
  const id = z.string().min(1).parse(formData.get("id"));
  const a = await prisma.appointment.findFirst({ where: { id, businessId, status: { in: ["CONFIRMED", "COMPLETED"] } } });
  if (!a || a.paymentStatus === "PAID") return;
  await prisma.appointment.update({ where: { id }, data: { paymentStatus: "PAID", amountPaidCents: a.priceCents } });
  revalidatePath("/admin");
}

const settingsSchema = z.object({
  name: z.string().trim().min(1).max(80),
  tagline: z.string().trim().max(120),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  bgColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  timezone: z.string().refine((tz) => DateTime.now().setZone(tz).isValid, "Zona horaria inválida"),
  currency: z.string().length(3),
  minNoticeMin: z.coerce.number().int().min(0).max(10080),
  maxAdvanceDays: z.coerce.number().int().min(1).max(365),
  reminders: z.string(),
  confirmTemplate: z.string().trim().min(1).max(600),
  reminderTemplate: z.string().trim().min(1).max(600),
  cancelTemplate: z.string().trim().min(1).max(600),
  rescheduleTemplate: z.string().trim().min(1).max(600),
  selfCancelTemplate: z.string().trim().min(1).max(600),
  changeNoticeHours: z.coerce.number().min(0).max(720),
});

export async function saveSettings(formData: FormData) {
  const { businessId } = await requireWritable();
  const d = settingsSchema.parse(Object.fromEntries(formData));
  const reminderOffsetsMin = d.reminders
    .split(",")
    .map((x) => parseInt(x.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);

  const current = await getBusinessById(businessId);
  // El logo ya se subió desde el formulario (/api/admin/upload); acá solo se acepta una URL propia de esta barbería.
  let logoUrl = current.logoUrl;
  const newLogo = formData.get("logoUrl")?.toString() ?? "";
  if (formData.get("removeLogo") === "on") {
    await deleteImage(logoUrl);
    logoUrl = null;
  } else if (newLogo && newLogo !== logoUrl) {
    if (!isOwnBlobUrl(newLogo, businessId)) throw new Error("Imagen inválida");
    await deleteImage(logoUrl);
    logoUrl = newLogo;
  }

  await prisma.business.update({
    where: { id: businessId },
    data: {
      name: d.name,
      tagline: d.tagline,
      logoUrl,
      primaryColor: d.primaryColor,
      useOwnColor: formData.get("useOwnColor") === "on",
      bgColor: d.bgColor,
      applyBgToAdmin: formData.get("applyBgToAdmin") === "on",
      timezone: d.timezone,
      currency: d.currency.toUpperCase(),
      minNoticeMin: d.minNoticeMin,
      maxAdvanceDays: d.maxAdvanceDays,
      reminderOffsetsMin,
      confirmTemplate: d.confirmTemplate,
      reminderTemplate: d.reminderTemplate,
      cancelTemplate: d.cancelTemplate,
      rescheduleTemplate: d.rescheduleTemplate,
      selfCancelTemplate: d.selfCancelTemplate,
      allowClientChanges: formData.get("allowClientChanges") === "on",
      changeMinNoticeMin: Math.round(d.changeNoticeHours * 60),
    },
  });
  revalidatePath("/", "layout");
}
