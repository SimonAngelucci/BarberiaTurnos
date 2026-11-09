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
import { remapDisabled } from "@/lib/schedule-grid";
import { isIconKey } from "@/lib/service-icons";
import { FEATURES } from "@/lib/features";
import { deleteImage, isOwnBlobUrl } from "@/lib/upload";
import { encryptSecret } from "@/lib/crypto";
import { configSchema } from "@/lib/page-config";
import type { Prisma } from "@prisma/client";
import { verifyMpToken } from "@/lib/payments";

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
  const type = z.enum(["BARBER", "TATTOO", "NAILS"]).parse(formData.get("businessType"));
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
  if (id && !existing) throw new Error("Barbero inexistente");

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

  const data = { name: d.name, bio: d.bio || null, photoUrl };
  if (existing) {
    await prisma.barber.update({ where: { id: existing.id }, data: { ...data, active: formData.get("active") === "on" } });
  } else {
    // Tope de barberos del plan contratado (durante la prueba no hay tope).
    const { barberLimit } = await getAccess(businessId);
    if (barberLimit !== null && (await prisma.barber.count({ where: { businessId, active: true } })) >= barberLimit) {
      throw new Error(`Tu plan permite hasta ${barberLimit} barberos. Cambiá de plan para agregar más.`);
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
    if (!barber) return { ok: false, error: "Ese barbero ya no existe." };

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
        ? [prisma.appointmentEvent.createMany({ data: ids.map((appointmentId) => ({ businessId, appointmentId, kind: "CANCELLED" as const, actor: "ADMIN" as const, note: "Barbero eliminado" })) })]
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

/**
 * Modalidad de los horarios. Solo cambia cómo se calculan los inicios que ve el cliente: no toca reservas, duraciones de
 * servicios, días ni horarios de atención. El intervalo se guarda aparte y se conserva al cambiar de modalidad.
 */
export async function saveScheduleMode(_prev: FormState, formData: FormData): Promise<FormState> {
  const { businessId } = await requireWritable();
  const mode = formData.get("scheduleMode");
  if (mode !== "AUTO" && mode !== "MANUAL") return { ok: false, error: "Elegí una modalidad." };
  await prisma.business.update({ where: { id: businessId }, data: { scheduleMode: mode } });
  revalidatePath("/admin/schedule");
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: mode === "AUTO" ? "Modo automático activado: los horarios se calculan según la duración de cada servicio." : "Modo manual activado: los turnos empiezan cada cierto intervalo fijo.",
  };
}

/**
 * Intervalo de los horarios (5 a 240 minutos, el que quieras). En modo manual es cada cuánto empieza un turno; en ambos modos
 * es el tamaño de las celdas que se activan o desactivan en la grilla. Los horarios que ya estaban desactivados se llevan a la
 * grilla nueva (ver remapDisabled), así que cambiarlo no reabre ni pierde bloqueos. Las reservas no se tocan.
 */
export async function saveSlotInterval(_prev: FormState, formData: FormData): Promise<FormState> {
  const { businessId } = await requireWritable();
  const n = Number(formData.get("slotIntervalMin"));
  if (!Number.isInteger(n) || n < 5 || n > 240) return { ok: false, error: "El intervalo tiene que ser un número entero de minutos, entre 5 y 240." };

  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { slotIntervalMin: true } });
  if (!business) return { ok: false, error: "No encontramos tu negocio." };
  if (business.slotIntervalMin === n) return { ok: true, message: `El intervalo ya era de ${n} minutos.` };

  const [hours, disabled] = await Promise.all([
    prisma.workingHour.findMany({ where: { barber: { businessId } }, select: { barberId: true, weekday: true, startMin: true, endMin: true } }),
    prisma.disabledSlot.findMany({ where: { barber: { businessId } }, select: { barberId: true, weekday: true, startMin: true } }),
  ]);
  const next: { barberId: string; weekday: number; startMin: number }[] = [];
  for (const h of hours) {
    const oldStarts = disabled.filter((d) => d.barberId === h.barberId && d.weekday === h.weekday).map((d) => d.startMin);
    if (!oldStarts.length) continue;
    for (const m of remapDisabled({ startMin: h.startMin, endMin: h.endMin, oldStarts, oldInterval: business.slotIntervalMin, newInterval: n })) {
      next.push({ barberId: h.barberId, weekday: h.weekday, startMin: m });
    }
  }
  await prisma.$transaction([
    prisma.disabledSlot.deleteMany({ where: { barber: { businessId } } }),
    prisma.disabledSlot.createMany({ data: next }),
    prisma.business.update({ where: { id: businessId }, data: { slotIntervalMin: n } }),
  ]);
  revalidatePath("/admin/schedule");
  revalidatePath("/", "layout");
  return { ok: true, message: `Listo: los horarios ahora se generan cada ${n} minutos. Los que tenías desactivados se mantuvieron.` };
}

export async function saveSchedule(formData: FormData) {
  const { businessId } = await requireWritable();
  const barberId = z.string().min(1).parse(formData.get("barberId"));
  const barber = await prisma.barber.findFirst({ where: { id: barberId, businessId } });
  if (!barber) throw new Error("Barbero inexistente");

  const hhmm = z.string().regex(/^\d{2}:\d{2}$/);
  const rows: { barberId: string; weekday: number; startMin: number; endMin: number }[] = [];
  const disabled: { barberId: string; weekday: number; startMin: number }[] = [];
  for (let wd = 0; wd < 7; wd++) {
    if (formData.get(`open_${wd}`) !== "on") continue;
    const startMin = hhmmToMin(hhmm.parse(formData.get(`start_${wd}`)));
    const endMin = hhmmToMin(hhmm.parse(formData.get(`end_${wd}`)));
    if (endMin <= startMin) continue;
    rows.push({ barberId, weekday: wd, startMin, endMin });

    // Slots desactivados: "570,600" = 09:30 y 10:00. Solo se guardan los que caen dentro de la franja.
    const offs = new Set(
      String(formData.get(`off_${wd}`) ?? "")
        .split(",")
        .map((x) => parseInt(x, 10))
        .filter((n) => Number.isInteger(n) && n >= startMin && n < endMin),
    );
    for (const startMinOff of offs) disabled.push({ barberId, weekday: wd, startMin: startMinOff });
  }
  await prisma.$transaction([
    prisma.workingHour.deleteMany({ where: { barberId } }),
    prisma.workingHour.createMany({ data: rows }),
    prisma.disabledSlot.deleteMany({ where: { barberId } }),
    prisma.disabledSlot.createMany({ data: disabled }),
  ]);
  revalidatePath("/admin/schedule");
}

export async function addTimeOff(formData: FormData) {
  const { businessId } = await requireWritable();
  const business = await getBusinessById(businessId);
  const d = z
    .object({
      barberId: z.string().optional(),
      start: z.string().min(1),
      end: z.string().min(1),
      reason: z.string().max(100).optional(),
    })
    .parse(Object.fromEntries(formData));

  const startAt = DateTime.fromISO(d.start, { zone: business.timezone });
  const endAt = DateTime.fromISO(d.end, { zone: business.timezone });
  if (!startAt.isValid || !endAt.isValid || endAt <= startAt) throw new Error("Rango inválido");

  await prisma.timeOff.create({
    data: {
      businessId,
      barberId: d.barberId || null,
      startAt: startAt.toJSDate(),
      endAt: endAt.toJSDate(),
      reason: d.reason || null,
    },
  });
  revalidatePath("/admin/schedule");
}

export async function deleteTimeOff(formData: FormData) {
  const { businessId } = await requireWritable();
  const id = z.string().min(1).parse(formData.get("id"));
  await prisma.timeOff.deleteMany({ where: { id, businessId } });
  revalidatePath("/admin/schedule");
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
