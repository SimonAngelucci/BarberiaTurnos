"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { DateTime } from "luxon";
import { z } from "zod";
import { prisma, getBusinessById } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { enqueueCancellation, dispatchDue } from "@/lib/outbox";
import { hhmmToMin } from "@/lib/format";
import { uploadImage, deleteImage } from "@/lib/upload";

// Todas las actions son endpoints públicos: SIEMPRE validar sesión y datos.

export async function cancelAppointment(formData: FormData) {
  const { businessId } = await requireAdmin();
  const id = z.string().min(1).parse(formData.get("id"));

  const res = await prisma.appointment.updateMany({
    where: { id, businessId, status: "CONFIRMED" },
    data: { status: "CANCELLED" },
  });
  if (res.count > 0) {
    await enqueueCancellation(id);
    after(() => dispatchDue().catch(console.error));
  }
  revalidatePath("/admin");
}

export async function setAppointmentStatus(formData: FormData) {
  const { businessId } = await requireAdmin();
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
  const { businessId } = await requireAdmin();
  const id = formData.get("id")?.toString();
  const d = serviceSchema.parse(Object.fromEntries(formData));
  const data = {
    name: d.name,
    description: d.description || null,
    priceCents: Math.round(d.price * 100),
    durationMin: d.durationMin,
  };
  if (id) {
    await prisma.service.updateMany({ where: { id, businessId }, data: { ...data, active: formData.get("active") === "on" } });
  } else {
    await prisma.service.create({ data: { ...data, businessId } });
  }
  revalidatePath("/admin/services");
  revalidatePath("/");
}

/** Soft delete: conserva el historial de turnos. */
export async function archiveService(formData: FormData) {
  const { businessId } = await requireAdmin();
  const id = z.string().min(1).parse(formData.get("id"));
  await prisma.service.updateMany({ where: { id, businessId }, data: { active: false } });
  revalidatePath("/admin/services");
  revalidatePath("/", "layout");
}

const barberSchema = z.object({
  name: z.string().trim().min(1, "Poné un nombre").max(60),
  bio: z.string().trim().max(400),
});

/** Crea o edita un barbero (nombre, foto, descripción). Con `id` edita; sin `id` crea. */
export async function saveBarber(formData: FormData) {
  const { businessId } = await requireAdmin();
  const id = formData.get("id")?.toString() || undefined;
  const d = barberSchema.parse({ name: formData.get("name"), bio: formData.get("bio") ?? "" });

  const existing = id ? await prisma.barber.findFirst({ where: { id, businessId } }) : null;
  if (id && !existing) throw new Error("Barbero inexistente");

  let photoUrl = existing?.photoUrl ?? null;
  const uploaded = await uploadImage(formData.get("photo"), `${businessId}/barbers`);
  if (uploaded) {
    await deleteImage(photoUrl);
    photoUrl = uploaded;
  } else if (formData.get("removePhoto") === "on") {
    await deleteImage(photoUrl);
    photoUrl = null;
  }

  const data = { name: d.name, bio: d.bio || null, photoUrl };
  if (existing) {
    await prisma.barber.update({ where: { id: existing.id }, data: { ...data, active: formData.get("active") === "on" } });
  } else {
    await prisma.barber.create({ data: { ...data, businessId } });
  }
  revalidatePath("/admin/barbers");
  revalidatePath("/admin/schedule");
  revalidatePath("/", "layout");
}

export async function saveSchedule(formData: FormData) {
  const { businessId } = await requireAdmin();
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
  const { businessId } = await requireAdmin();
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
  const { businessId } = await requireAdmin();
  const id = z.string().min(1).parse(formData.get("id"));
  await prisma.timeOff.deleteMany({ where: { id, businessId } });
  revalidatePath("/admin/schedule");
}

const settingsSchema = z.object({
  name: z.string().trim().min(1).max(80),
  tagline: z.string().trim().max(120),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  bgColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  timezone: z.string().refine((tz) => DateTime.now().setZone(tz).isValid, "Zona horaria inválida"),
  currency: z.string().length(3),
  slotIntervalMin: z.coerce.number().int().min(5).max(240),
  minNoticeMin: z.coerce.number().int().min(0).max(10080),
  maxAdvanceDays: z.coerce.number().int().min(1).max(365),
  reminders: z.string(),
  confirmTemplate: z.string().trim().min(1).max(600),
  reminderTemplate: z.string().trim().min(1).max(600),
  cancelTemplate: z.string().trim().min(1).max(600),
});

export async function saveSettings(formData: FormData) {
  const { businessId } = await requireAdmin();
  const d = settingsSchema.parse(Object.fromEntries(formData));
  const reminderOffsetsMin = d.reminders
    .split(",")
    .map((x) => parseInt(x.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);

  const current = await getBusinessById(businessId);
  let logoUrl = current.logoUrl;
  const uploaded = await uploadImage(formData.get("logo"), `${businessId}/logo`);
  if (uploaded) {
    await deleteImage(logoUrl);
    logoUrl = uploaded;
  } else if (formData.get("removeLogo") === "on") {
    await deleteImage(logoUrl);
    logoUrl = null;
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
      slotIntervalMin: d.slotIntervalMin,
      minNoticeMin: d.minNoticeMin,
      maxAdvanceDays: d.maxAdvanceDays,
      reminderOffsetsMin,
      confirmTemplate: d.confirmTemplate,
      reminderTemplate: d.reminderTemplate,
      cancelTemplate: d.cancelTemplate,
    },
  });
  revalidatePath("/", "layout");
}
