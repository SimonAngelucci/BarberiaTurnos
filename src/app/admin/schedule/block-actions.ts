"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { z } from "zod";
import { prisma, getBusinessById } from "@/lib/db";
import { requireWritable } from "@/lib/guard";
import { buildRescheduleOps, dispatchDue, enqueueCancellation } from "@/lib/outbox";
import { HOLD_MINUTES } from "@/lib/payment-math";
import { expandBlock, findConflicts, type Interval } from "@/lib/blocks";
import { getAvailableSlots, isSlotAvailable } from "@/lib/slots";

export type Resolution = { action: "keep" } | { action: "cancel" } | { action: "move"; startAt: string };
export type ConflictInfo = { id: string; customer: string; service: string; barberId: string | null; barberName: string | null; startAt: string; serviceId: string };
export type BlockResult = { ok: true; created: number } | { ok: false; error: string; conflicts?: ConflictInfo[] };

const inputSchema = z.object({
  barberId: z.string().min(1).nullable(),
  dateFrom: z.string(),
  dateTo: z.string().nullable().optional(),
  allDay: z.boolean(),
  timeFrom: z.string().nullable().optional(),
  timeTo: z.string().nullable().optional(),
  repeatUntil: z.string().nullable().optional(),
  reason: z.string().trim().max(100).nullable().optional(),
  /** Editar: id del bloqueo (o de la serie) que este reemplaza. */
  replaceId: z.string().nullable().optional(),
  replaceScope: z.enum(["one", "series"]).optional(),
});
export type BlockInput = z.infer<typeof inputSchema>;

const isOverlap = (e: unknown) => /appointment_one_per_start|appointment_no_overlap|23505|23P01|Unique constraint/i.test(String((e as Error)?.message ?? e));

/** Turnos activos de esos profesionales dentro de lo que se quiere bloquear. */
async function activeConflicts(businessId: string, intervals: Interval[], barberId: string | null) {
  const from = new Date(Math.min(...intervals.map((i) => i.startAt.getTime())));
  const to = new Date(Math.max(...intervals.map((i) => i.endAt.getTime())));
  const rows = await prisma.appointment.findMany({
    where: {
      businessId,
      status: { in: ["CONFIRMED", "PENDING_PAYMENT"] },
      NOT: { status: "PENDING_PAYMENT", createdAt: { lt: new Date(Date.now() - HOLD_MINUTES * 60_000) } },
      startAt: { gte: from, lt: to },
      ...(barberId ? { barberId } : {}),
    },
    orderBy: { startAt: "asc" },
    include: { customer: { select: { firstName: true, lastName: true } }, service: { select: { name: true } }, barber: { select: { name: true } } },
  });
  return findConflicts(rows, intervals, barberId);
}

/**
 * Crea (o reemplaza, al editar) un bloqueo. NO borra nada de la configuración semanal: es una excepción sobre fechas y horas
 * concretas. Si ya hay turnos reservados adentro NO los toca: devuelve la lista para que el administrador elija qué hacer con
 * cada uno (mantenerlo, reprogramarlo o cancelarlo y avisar al cliente) y recién ahí aplica todo.
 */
export async function createBlock(raw: BlockInput, resolutions?: Record<string, Resolution>): Promise<BlockResult> {
  const session = await requireWritable();
  const { businessId } = session;
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Revisá los datos del bloqueo." };
  const d = parsed.data;
  const biz = await getBusinessById(businessId);

  if (d.barberId && !(await prisma.barber.findFirst({ where: { id: d.barberId, businessId }, select: { id: true } }))) return { ok: false, error: "Profesional inexistente" };

  let intervals: Interval[];
  try {
    intervals = expandBlock({ barberId: d.barberId, dateFrom: d.dateFrom, dateTo: d.dateTo, allDay: d.allDay, timeFrom: d.timeFrom, timeTo: d.timeTo, repeatUntil: d.repeatUntil }, biz.timezone);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const conflicts = await activeConflicts(businessId, intervals, d.barberId);
  if (conflicts.length > 0) {
    const missing = conflicts.filter((c) => !resolutions?.[c.id]);
    if (missing.length > 0) {
      return {
        ok: false,
        error: "Hay turnos reservados en ese horario.",
        conflicts: conflicts.map((c) => ({ id: c.id, customer: `${c.customer.firstName} ${c.customer.lastName}`.trim(), service: c.service.name, serviceId: c.serviceId, barberId: c.barberId, barberName: c.barber?.name ?? null, startAt: c.startAt.toISOString() })),
      };
    }
    // Primero se resuelven los turnos (reprogramar / cancelar); si alguno falla no se crea el bloqueo.
    for (const c of conflicts) {
      const r = resolutions![c.id];
      if (r.action === "keep") continue;
      if (r.action === "cancel") {
        const before = await prisma.appointment.findFirst({ where: { id: c.id, businessId, status: { in: ["CONFIRMED", "PENDING_PAYMENT"] } }, select: { startAt: true, status: true } });
        const res = await prisma.appointment.updateMany({ where: { id: c.id, businessId, status: { in: ["CONFIRMED", "PENDING_PAYMENT"] } }, data: { status: "CANCELLED" } });
        if (res.count > 0) {
          await prisma.appointmentEvent.create({ data: { businessId, appointmentId: c.id, kind: "CANCELLED", actor: "ADMIN", fromStartAt: before?.startAt ?? null, note: "Horario bloqueado" } });
          if (before?.status === "CONFIRMED") await enqueueCancellation(c.id);
        }
        continue;
      }
      // Reprogramar: el nuevo horario tiene que estar libre y fuera de lo que se está bloqueando.
      const newStart = new Date(r.startAt);
      const a = await prisma.appointment.findFirst({ where: { id: c.id, businessId, status: "CONFIRMED" } });
      if (!a || !a.barberId) return { ok: false, error: `No se pudo reprogramar el turno de ${c.customer.firstName}.` };
      const inBlock = intervals.some((i) => (d.barberId === null || d.barberId === a.barberId) && newStart.getTime() >= i.startAt.getTime() && newStart.getTime() < i.endAt.getTime());
      if (inBlock || !(await isSlotAvailable({ businessId, barberId: a.barberId, serviceId: a.serviceId, startAt: newStart, excludeAppointmentId: a.id }))) {
        return { ok: false, error: `El nuevo horario de ${c.customer.firstName} ya no está disponible. Elegí otro.` };
      }
      const newEnd = new Date(newStart.getTime() + (a.endAt.getTime() - a.startAt.getTime()));
      try {
        await prisma.$transaction([
          prisma.appointment.update({ where: { id: a.id, status: "CONFIRMED" }, data: { startAt: newStart, endAt: newEnd } }),
          prisma.appointmentEvent.create({ data: { businessId, appointmentId: a.id, kind: "RESCHEDULED", actor: "ADMIN", fromStartAt: a.startAt, toStartAt: newStart } }),
          ...(await buildRescheduleOps(a.id, newStart, newEnd)),
        ]);
      } catch (e) {
        if (isOverlap(e)) return { ok: false, error: "Ese horario se ocupó recién. Elegí otro." };
        console.error("block move", e);
        return { ok: false, error: "No se pudo reprogramar el turno." };
      }
    }
    after(() => dispatchDue().catch(console.error));
  }

  const groupId = intervals.length > 1 ? randomUUID() : null;
  const rows = intervals.map((i) => ({ businessId, barberId: d.barberId, startAt: i.startAt, endAt: i.endAt, reason: d.reason || null, createdBy: session.adminId ?? null, groupId }));
  await prisma.$transaction(async (tx) => {
    if (d.replaceId) await removeRows(tx, businessId, d.replaceId, d.replaceScope ?? "one");
    await tx.timeOff.createMany({ data: rows });
  });
  refresh();
  return { ok: true, created: rows.length };
}

/** Bloquea varios horarios puntuales de una (agenda → modo «Seleccionar»). Cada uno queda como bloqueo propio. */
export async function createSlotBlocks(items: { barberId: string; startAt: string }[], reason?: string): Promise<BlockResult> {
  const session = await requireWritable();
  const { businessId } = session;
  const p = z.array(z.object({ barberId: z.string().min(1), startAt: z.string().min(1) })).min(1).max(200).safeParse(items);
  if (!p.success) return { ok: false, error: "No hay horarios para bloquear." };
  const barberIds = [...new Set(p.data.map((x) => x.barberId))];
  const owned = await prisma.barber.findMany({ where: { id: { in: barberIds }, businessId }, select: { id: true } });
  if (owned.length !== barberIds.length) return { ok: false, error: "Profesional inexistente" };
  const now = Date.now();
  const rows = p.data
    .map((x) => ({ barberId: x.barberId, start: new Date(x.startAt) }))
    .filter((x) => !Number.isNaN(x.start.getTime()) && x.start.getTime() + 60_000 > now)
    .map((x) => ({ businessId, barberId: x.barberId, startAt: x.start, endAt: new Date(x.start.getTime() + 60_000), reason: reason?.trim().slice(0, 100) || null, createdBy: session.adminId ?? null, groupId: null }));
  if (rows.length === 0) return { ok: false, error: "Esos horarios ya pasaron." };
  await prisma.timeOff.createMany({ data: rows });
  refresh();
  return { ok: true, created: rows.length };
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
/** Quita un bloqueo, o toda su serie (solo lo que todavía no pasó: lo pasado queda de historial). */
async function removeRows(tx: Tx, businessId: string, id: string, scope: "one" | "series") {
  const row = await tx.timeOff.findFirst({ where: { id, businessId }, select: { groupId: true } });
  if (!row) return;
  if (scope === "series" && row.groupId) await tx.timeOff.deleteMany({ where: { businessId, groupId: row.groupId, endAt: { gt: new Date() } } });
  else await tx.timeOff.deleteMany({ where: { id, businessId } });
}

/** Desbloquear: el horario vuelve a estar disponible al instante. */
export async function removeBlock(id: string, scope: "one" | "series" = "one"): Promise<{ ok: boolean }> {
  const { businessId } = await requireWritable();
  const parsed = z.string().min(1).safeParse(id);
  if (!parsed.success) return { ok: false };
  await prisma.$transaction((tx) => removeRows(tx, businessId, parsed.data, scope));
  refresh();
  return { ok: true };
}

/**
 * Próximos horarios libres de un profesional para reprogramar un turno (los de los próximos 14 días), sin contar lo que se está
 * bloqueando. Lo usa el aviso de «este horario tiene un turno».
 */
export async function moveOptions(appointmentId: string, blockIntervals: { startAt: string; endAt: string }[], blockBarberId: string | null): Promise<string[]> {
  const { businessId } = await requireWritable();
  const a = await prisma.appointment.findFirst({ where: { id: appointmentId, businessId, status: "CONFIRMED" }, select: { id: true, barberId: true, serviceId: true } });
  if (!a?.barberId) return [];
  const biz = await getBusinessById(businessId);
  const ivs = blockIntervals.map((i) => ({ s: new Date(i.startAt).getTime(), e: new Date(i.endAt).getTime() }));
  const affects = blockBarberId === null || blockBarberId === a.barberId;
  const out: string[] = [];
  const today = DateTime.now().setZone(biz.timezone).startOf("day");
  for (let n = 0; n < 14 && out.length < 12; n++) {
    const slots = await getAvailableSlots({ businessId, barberId: a.barberId, serviceId: a.serviceId, date: today.plus({ days: n }).toISODate()!, excludeAppointmentId: a.id });
    for (const s of slots) {
      const t = new Date(s).getTime();
      if (affects && ivs.some((i) => t >= i.s && t < i.e)) continue;
      out.push(s);
      if (out.length >= 12) break;
    }
  }
  return out;
}

function refresh() {
  revalidatePath("/admin/schedule");
  revalidatePath("/admin/turnos");
  revalidatePath("/", "layout");
}
