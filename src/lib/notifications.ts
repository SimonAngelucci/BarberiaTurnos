import { DateTime } from "luxon";
import { prisma } from "./db";

export type Notice = {
  id: string;
  kind: "new" | "cancel" | "reschedule" | "reminder";
  /** Cuándo pasó (o, en recordatorios, cuándo es el turno), ISO UTC. */
  at: string;
  title: string;
  detail: string;
  unread: boolean;
};

/** Por cuánto tiempo se muestran los avisos en el panel. */
const KEEP_DAYS = 7;
/** Recordatorio en el panel: turnos que empiezan dentro de esta ventana. */
const SOON_MIN = 60;

/**
 * Avisos del panel, armados con el historial de cada turno (AppointmentEvent): nuevos turnos, cancelaciones y reprogramaciones
 * hechas por el cliente, más los turnos que están por empezar. Lo que hace el propio administrador no genera aviso.
 * «Sin leer» = ocurrió después de la última vez que marcó las notificaciones como leídas.
 */
export async function getNotifications(businessId: string, adminId: string): Promise<{ unread: number; items: Notice[] }> {
  const now = new Date();
  const admin = await prisma.adminUser.findUnique({ where: { id: adminId }, select: { notificationsSeenAt: true } });
  const seen = admin?.notificationsSeenAt ?? new Date(now.getTime() - 24 * 3600_000);
  const biz = await prisma.business.findUnique({ where: { id: businessId }, select: { timezone: true } });
  const tz = biz?.timezone ?? "UTC";
  const when = (d: Date) => DateTime.fromJSDate(d).setZone(tz).setLocale("es").toFormat("ccc d LLL · HH:mm");

  const [events, soon] = await Promise.all([
    prisma.appointmentEvent.findMany({
      where: { businessId, actor: { not: "ADMIN" }, createdAt: { gte: new Date(now.getTime() - KEEP_DAYS * 86400_000) } },
      orderBy: { createdAt: "desc" },
      take: 40,
      include: { appointment: { select: { status: true, startAt: true, customer: { select: { firstName: true, lastName: true } }, service: { select: { name: true } }, events: { select: { kind: true, actor: true } } } } },
    }),
    prisma.appointment.findMany({
      where: { businessId, status: "CONFIRMED", startAt: { gte: now, lte: new Date(now.getTime() + SOON_MIN * 60_000) } },
      orderBy: { startAt: "asc" },
      take: 10,
      select: { id: true, startAt: true, customer: { select: { firstName: true, lastName: true } }, service: { select: { name: true } } },
    }),
  ]);

  const items: Notice[] = [];
  for (const e of events) {
    const a = e.appointment;
    const who = `${a.customer.firstName} ${a.customer.lastName}`;
    const base = { id: e.id, at: e.createdAt.toISOString(), unread: e.createdAt > seen };
    if (e.kind === "CREATED") {
      if (a.status === "PENDING_PAYMENT" || a.status === "CANCELLED") continue; // todavía no es un turno firme (o ya se canceló)
      // Si se pagó online, el aviso es el del cobro, no el de cuando el cliente empezó a reservar.
      if (e.actor === "CLIENT" && a.events.some((x) => x.kind === "CREATED" && x.actor === "SYSTEM")) continue;
      items.push({ ...base, kind: "new", title: "Nuevo turno", detail: `${who} · ${a.service.name} · ${when(a.startAt)}` });
    } else if (e.kind === "CANCELLED") {
      items.push({ ...base, kind: "cancel", title: "Turno cancelado", detail: `${who} · ${a.service.name}${e.fromStartAt ? ` · ${when(e.fromStartAt)}` : ""}` });
    } else if (e.kind === "RESCHEDULED") {
      items.push({ ...base, kind: "reschedule", title: "Turno reprogramado", detail: `${who} · ${e.fromStartAt ? when(e.fromStartAt) : "?"} → ${e.toStartAt ? when(e.toStartAt) : "?"}` });
    }
  }

  const reminders: Notice[] = soon.map((a) => {
    const mins = Math.max(0, Math.round((a.startAt.getTime() - now.getTime()) / 60_000));
    return {
      id: `soon-${a.id}`,
      kind: "reminder",
      at: a.startAt.toISOString(),
      title: mins <= 1 ? "Turno ahora" : `Turno en ${mins} min`,
      detail: `${a.customer.firstName} ${a.customer.lastName} · ${a.service.name}`,
      unread: true,
    };
  });

  const all = [...reminders, ...items];
  return { unread: all.filter((i) => i.unread).length, items: all };
}

export async function markNotificationsSeen(adminId: string) {
  await prisma.adminUser.update({ where: { id: adminId }, data: { notificationsSeenAt: new Date() } });
}
