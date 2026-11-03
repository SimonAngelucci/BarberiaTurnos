import { DateTime } from "luxon";
import type { MessageKind } from "@prisma/client";
import { prisma } from "./db";
import { sendWhatsApp } from "./whatsapp";

const MAX_ATTEMPTS = 3;

function render(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? "");
}

async function loadAppointment(id: string) {
  return prisma.appointment.findUniqueOrThrow({
    where: { id },
    include: { business: true, customer: true, service: true },
  });
}

function buildVars(a: Awaited<ReturnType<typeof loadAppointment>>) {
  const local = DateTime.fromJSDate(a.startAt).setZone(a.business.timezone).setLocale("es");
  return {
    nombre: a.customer.firstName,
    servicio: a.service.name,
    negocio: a.business.name,
    fecha: local.toFormat("cccc d 'de' LLLL"),
    hora: local.toFormat("HH:mm"),
  };
}

const TEMPLATE_ENV: Record<MessageKind, string> = {
  CONFIRMATION: "WA_TPL_CONFIRM",
  REMINDER: "WA_TPL_REMINDER",
  CANCELLATION: "WA_TPL_CANCEL",
};

function row(a: Awaited<ReturnType<typeof loadAppointment>>, kind: MessageKind, sendAt: Date) {
  const vars = buildVars(a);
  const tpl =
    kind === "CONFIRMATION" ? a.business.confirmTemplate : kind === "REMINDER" ? a.business.reminderTemplate : a.business.cancelTemplate;
  return {
    businessId: a.businessId,
    appointmentId: a.id,
    kind,
    to: a.customer.phone,
    body: render(tpl, vars),
    templateName: process.env[TEMPLATE_ENV[kind]] ?? null,
    // Orden de variables {{1}}..{{5}} de las plantillas de Meta
    params: [vars.nombre, vars.servicio, vars.fecha, vars.hora, vars.negocio],
    sendAt,
  };
}

/** Encola confirmación inmediata + recordatorios futuros. */
export async function enqueueBookingMessages(appointmentId: string) {
  const a = await loadAppointment(appointmentId);
  const now = Date.now();
  const data = [row(a, "CONFIRMATION", new Date())];
  for (const offset of a.business.reminderOffsetsMin) {
    const at = a.startAt.getTime() - offset * 60_000;
    if (at > now + 60_000) data.push(row(a, "REMINDER", new Date(at)));
  }
  await prisma.message.createMany({ data });
}

export async function enqueueCancellation(appointmentId: string) {
  const a = await loadAppointment(appointmentId);
  await prisma.$transaction([
    prisma.message.updateMany({
      where: { appointmentId, kind: "REMINDER", status: "PENDING" },
      data: { status: "SKIPPED" },
    }),
    prisma.message.create({ data: row(a, "CANCELLATION", new Date()) }),
  ]);
}

/**
 * Prepara (sin ejecutar) las operaciones para avisar la cancelación de varios turnos a la vez:
 * saltea sus recordatorios pendientes y encola un mensaje de cancelación por turno.
 * Devuelve operaciones de Prisma para correr dentro de la misma transacción que la cancelación.
 */
export async function buildCancellationOps(appointmentIds: string[]) {
  if (appointmentIds.length === 0) return [];
  const appts = await prisma.appointment.findMany({
    where: { id: { in: appointmentIds } },
    include: { business: true, customer: true, service: true },
  });
  return [
    prisma.message.updateMany({
      where: { appointmentId: { in: appointmentIds }, kind: "REMINDER", status: "PENDING" },
      data: { status: "SKIPPED" },
    }),
    prisma.message.createMany({ data: appts.map((a) => row(a, "CANCELLATION", new Date())) }),
  ];
}

/** Envía los mensajes vencidos. Idempotente y seguro con ejecuciones concurrentes. */
export async function dispatchDue(limit = 25) {
  const due = await prisma.message.findMany({
    where: { status: "PENDING", sendAt: { lte: new Date() } },
    orderBy: { sendAt: "asc" },
    take: limit,
    include: { appointment: { select: { status: true } } },
  });

  let sent = 0;
  for (const m of due) {
    // Claim atómico: solo un worker puede pasar de PENDING a SENDING
    const claim = await prisma.message.updateMany({
      where: { id: m.id, status: "PENDING" },
      data: { status: "SENDING" },
    });
    if (claim.count === 0) continue;

    if (m.kind === "REMINDER" && m.appointment?.status === "CANCELLED") {
      await prisma.message.update({ where: { id: m.id }, data: { status: "SKIPPED" } });
      continue;
    }

    try {
      const r = await sendWhatsApp({
        to: m.to,
        body: m.body,
        templateName: m.templateName,
        params: (m.params as string[] | null) ?? null,
      });
      await prisma.message.update({
        where: { id: m.id },
        data: { status: "SENT", externalId: r.id, attempts: { increment: 1 }, error: null },
      });
      sent++;
    } catch (e) {
      const attempts = m.attempts + 1;
      await prisma.message.update({
        where: { id: m.id },
        data: {
          attempts,
          error: e instanceof Error ? e.message.slice(0, 500) : "error",
          status: attempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING",
          sendAt: new Date(Date.now() + 5 * 60_000 * attempts),
        },
      });
    }
  }
  return { processed: due.length, sent };
}
