"use server";

import { revalidatePath } from "next/cache";
import { DateTime } from "luxon";
import { z } from "zod";
import { prisma, getBusinessById } from "@/lib/db";
import { requireWritable } from "@/lib/guard";
import { hhmmToMin } from "@/lib/format";
import { normalizeCoupon } from "@/lib/discounts";

const schema = z.object({
  name: z.string().trim().min(1, "Poné un nombre").max(60),
  kind: z.enum(["PERCENT", "FIXED"]),
  value: z.coerce.number().positive("Poné un valor mayor a 0"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  coupon: z.string().max(40).optional(),
  maxUses: z.string().optional(),
});

/** Crea o edita un descuento. Todo valida en el servidor; el precio final se calcula al reservar (lib/discounts.ts). */
export async function saveDiscount(formData: FormData) {
  const { businessId } = await requireWritable();
  const business = await getBusinessById(businessId);
  const id = formData.get("id")?.toString() || undefined;
  const d = schema.parse(Object.fromEntries(formData));

  if (d.kind === "PERCENT" && d.value > 100) throw new Error("El porcentaje no puede pasar de 100");
  const value = d.kind === "PERCENT" ? Math.round(d.value) : Math.round(d.value * 100);
  if (value < 1) throw new Error("El valor es muy chico");

  const day = (s: string | undefined, end: boolean) => {
    if (!s) return null;
    const t = DateTime.fromISO(s, { zone: business.timezone });
    if (!t.isValid) throw new Error("Fecha inválida");
    return (end ? t.endOf("day") : t.startOf("day")).toJSDate();
  };
  const startsAt = day(d.startDate, false);
  const endsAt = day(d.endDate, true);
  if (startsAt && endsAt && endsAt < startsAt) throw new Error("La fecha de fin es anterior a la de inicio");

  const startMin = d.startTime ? hhmmToMin(d.startTime) : null;
  const endMin = d.endTime ? hhmmToMin(d.endTime) : null;
  if (startMin !== null && endMin !== null && endMin <= startMin) throw new Error("La hora de fin tiene que ser posterior a la de inicio");

  const allServices = formData.get("allServices") === "on";
  const picked = formData.getAll("serviceId").map(String);
  const services = allServices || picked.length === 0 ? [] : await prisma.service.findMany({ where: { businessId, id: { in: picked } }, select: { id: true } });
  const serviceIds = Array.isArray(services) ? services.map((s) => s.id) : [];
  const weekdays = formData.getAll("weekday").map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);

  const couponCode = normalizeCoupon(d.coupon) || null;
  if (couponCode && !/^[A-Z0-9_-]{3,20}$/.test(couponCode)) throw new Error("El cupón tiene que tener entre 3 y 20 letras o números");
  const maxUses = d.maxUses ? Math.max(1, Math.round(Number(d.maxUses))) : null;
  if (d.maxUses && !Number.isFinite(Number(d.maxUses))) throw new Error("Límite de usos inválido");

  if (couponCode) {
    const clash = await prisma.discount.findFirst({ where: { businessId, couponCode, ...(id ? { id: { not: id } } : {}) }, select: { id: true } });
    if (clash) throw new Error("Ya tenés otro descuento con ese cupón");
  }

  const data = {
    name: d.name,
    kind: d.kind,
    value,
    serviceIds,
    weekdays,
    startMin,
    endMin,
    startsAt,
    endsAt,
    couponCode,
    maxUses: couponCode ? maxUses : null,
    active: id ? formData.get("active") === "on" : true,
  };
  if (id) {
    const res = await prisma.discount.updateMany({ where: { id, businessId }, data });
    if (res.count === 0) throw new Error("Descuento inexistente");
  } else {
    await prisma.discount.create({ data: { ...data, businessId } });
  }
  revalidatePath("/admin/promociones");
  revalidatePath("/", "layout");
}

export async function toggleDiscount(formData: FormData) {
  const { businessId } = await requireWritable();
  const id = z.string().min(1).parse(formData.get("id"));
  const cur = await prisma.discount.findFirst({ where: { id, businessId }, select: { active: true } });
  if (!cur) throw new Error("Descuento inexistente");
  await prisma.discount.updateMany({ where: { id, businessId }, data: { active: !cur.active } });
  revalidatePath("/admin/promociones");
  revalidatePath("/", "layout");
}

/** Los turnos ya reservados con este descuento conservan su precio (se guarda en el turno, no se recalcula). */
export async function deleteDiscount(formData: FormData) {
  const { businessId } = await requireWritable();
  const id = z.string().min(1).parse(formData.get("id"));
  await prisma.discount.deleteMany({ where: { id, businessId } });
  revalidatePath("/admin/promociones");
  revalidatePath("/", "layout");
}
