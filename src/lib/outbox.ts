import { DateTime } from "luxon";
import type { MessageKind } from "@prisma/client";
import { prisma } from "./db";
import { sendWhatsApp } from "./whatsapp";
import { money, noticePhrase } from "./format";

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

type Appt = Awaited<ReturnType<typeof loadAppointment>>;

function buildVars(a: Appt, paidCents = 0, prevStart?: Date) {
  const tz = a.business.timezone;
  const local = DateTime.fromJSDate(a.startAt).setZone(tz).setLocale("es");
  const prev = prevStart ? DateTime.fromJSDate(prevStart).setZone(tz).setLocale("es") : null;
  return {
    nombre: a.customer.firstName,
    servicio: a.service.name,
    negocio: a.business.name,
    fecha: local.toFormat("cccc d 'de' LLLL"),
    hora: local.toFormat("HH:mm"),
    monto: money(paidCents, a.business.currency),
    codigo: a.claimCode ?? "",
    fecha_anterior: prev?.toFormat("cccc d 'de' LLLL") ?? "",
    hora_anterior: prev?.toFormat("HH:mm") ?? "",
  };
}

const TEMPLATE_ENV: Record<MessageKind, string> = {
  CONFIRMATION: "WA_TPL_CONFIRM",
  REMINDER: "WA_TPL_REMINDER",
  CANCELLATION: "WA_TPL_CANCEL",
  PAYMENT: "WA_TPL_PAYMENT",
  RESCHEDULE: "WA_TPL_RESCHEDULE",
  SELF_CANCEL: "WA_TPL_SELFCANCEL",
};

/** Mensajes que llevan el código de reclamo para que el cliente pueda reprogramar o cancelar. */
const WITH_CODE: MessageKind[] = ["CONFIRMATION", "PAYMENT", "RESCHEDULE"];

function templateFor(b: Appt["business"], kind: MessageKind) {
  switch (kind) {
    case "CONFIRMATION": return b.confirmTemplate;
    case "REMINDER": return b.reminderTemplate;
    case "PAYMENT": return b.paymentTemplate;
    case "RESCHEDULE": return b.rescheduleTemplate;
    case "SELF_CANCEL": return b.selfCancelTemplate;
    default: return b.cancelTemplate;
  }
}

/**
 * Si el texto guardado por la barbería no incluye {{codigo}} (todos los anteriores a esta función),
 * se agrega solo el código y el plazo al final: así el cliente lo recibe sin que el dueño edite nada.
 */
function withClaimInfo(body: string, tpl: string, a: Appt) {
  if (!a.claimCode || !a.business.allowClientChanges || tpl.includes("{{codigo}}")) return body;
  const site = process.env.SITE_URL?.replace(/\/$/, "");
  const link = site ? `\nGestioná tu turno acá: ${site}/b/${a.business.slug}/turno?c=${a.claimCode}` : "";
  return `${body}\n\n🔑 Tu código para reprogramar o cancelar: ${a.claimCode}\nPodés hacerlo ${noticePhrase(a.business.changeMinNoticeMin)}.${link}`;
}

function row(a: Appt, kind: MessageKind, sendAt: Date, paidCents = 0, prevStart?: Date) {
  const vars = buildVars(a, paidCents, prevStart);
  const tpl = templateFor(a.business, kind);
  const body = render(tpl, vars);
  // Orden de variables {{1}}.. de las plantillas de Meta. Se agregan al final para no romper las ya aprobadas:
  // pago = +monto, reprogramación = +fecha y hora anteriores, y el código solo si WA_TEMPLATE_CODE_PARAM=true.
  const params = [vars.nombre, vars.servicio, vars.fecha, vars.hora, vars.negocio];
  if (kind === "PAYMENT") params.push(vars.monto);
  if (kind === "RESCHEDULE") params.push(vars.fecha_anterior, vars.hora_anterior);
  if (WITH_CODE.includes(kind) && process.env.WA_TEMPLATE_CODE_PARAM === "true") params.push(vars.codigo);
  return {
    businessId: a.businessId,
    appointmentId: a.id,
    kind,
    to: a.customer.phone,
    body: WITH_CODE.includes(kind) ? withClaimInfo(body, tpl, a) : body,
    templateName: process.env[TEMPLATE_ENV[kind]] ?? null,
    params,
    sendAt,
  };
}

/**
 * Encola la confirmación inmediata + recordatorios futuros.
 * Si el turno se pagó online (`paidCents`), la confirmación es el mensaje de pago recibido.
 */
export async function enqueueBookingMessages(appointmentId: string, paidCents = 0) {
  const a = await loadAppointment(appointmentId);
  const now = Date.now();
  const data = [paidCents > 0 ? row(a, "PAYMENT", new Date(), paidCents) : row(a, "CONFIRMATION", new Date())];
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

/**
 * Operaciones (sin ejecutar) para mover un turno a otro horario: saltea los recordatorios viejos, encola el aviso
 * de reprogramación y los recordatorios del nuevo horario. Se corren en la MISMA transacción que el cambio de fecha.
 */
export async function buildRescheduleOps(appointmentId: string, newStart: Date, newEnd: Date) {
  const a = await loadAppointment(appointmentId);
  const moved = { ...a, startAt: newStart, endAt: newEnd };
  const now = Date.now();
  const data = [row(moved, "RESCHEDULE", new Date(), 0, a.startAt)];
  for (const offset of a.business.reminderOffsetsMin) {
    const at = newStart.getTime() - offset * 60_000;
    if (at > now + 60_000) data.push(row(moved, "REMINDER", new Date(at)));
  }
  return [
    prisma.message.updateMany({ where: { appointmentId, kind: "REMINDER", status: "PENDING" }, data: { status: "SKIPPED" } }),
    prisma.message.createMany({ data }),
  ];
}

/** Operaciones (sin ejecutar) para avisar que el cliente canceló su propio turno. */
export async function buildSelfCancelOps(appointmentId: string) {
  const a = await loadAppointment(appointmentId);
  return [
    prisma.message.updateMany({ where: { appointmentId, kind: "REMINDER", status: "PENDING" }, data: { status: "SKIPPED" } }),
    prisma.message.createMany({ data: [row(a, "SELF_CANCEL", new Date())] }),
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
