"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { DateTime } from "luxon";
import { z } from "zod";
import { prisma, getBusiness } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { enqueueCancellation, dispatchDue } from "@/lib/outbox";
import { hhmmToMin } from "@/lib/format";

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
  revalidatePath("/");
}

export async function addBarber(formData: FormData) {
  const { businessId } = await requireAdmin();
  const name = z.string().trim().min(1).max(60).parse(formData.get("name"));
  await prisma.barber.create({ data: { businessId, name } });
  revalidatePath("/admin/schedule");
  revalidatePath("/");
}

export async function saveSchedule(formData: FormData) {
  const { businessId } = await requireAdmin();
  const barberId = z.string().min(1).parse(formData.get("barberId"));
  const barber = await prisma.barber.findFirst({ where: { id: barberId, businessId } });
  if (!barber) throw new Error("Barbero inexistente");

  const rows: { barberId: string; weekday: number; startMin: number; endMin: number }[] = [];
  for (let wd = 0; wd < 7; wd++) {
    if (formData.get(`open_${wd}`) !== "on") continue;
    const startMin = hhmmToMin(z.string().regex(/^\d{2}:\d{2}$/).parse(formData.get(`start_${wd}`)));
    const endMin = hhmmToMin(z.string().regex(/^\d{2}:\d{2}$/).parse(formData.get(`end_${wd}`)));
    if (endMin > startMin) rows.push({ barberId, weekday: wd, startMin, endMin });
  }
  await prisma.$transaction([
    prisma.workingHour.deleteMany({ where: { barberId } }),
    prisma.workingHour.createMany({ data: rows }),
  ]);
  revalidatePath("/admin/schedule");
}

export async function addTimeOff(formData: FormData) {
  const { businessId } = await requireAdmin();
  const business = await getBusiness();
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
  logoUrl: z.string().trim().url().or(z.literal("")),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
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

  await prisma.business.update({
    where: { id: businessId },
    data: {
      name: d.name,
      tagline: d.tagline,
      logoUrl: d.logoUrl || null,
      primaryColor: d.primaryColor,
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
