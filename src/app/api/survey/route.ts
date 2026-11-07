import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { blocked, clientIp, recordFailure } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const schema = z.object({
  slug: z.string().min(1).max(60),
  token: z.string().regex(/^[0-9a-f]{32}$/),
  minutes: z.number().int().min(5, "Mínimo 5 minutos.").max(480, "Máximo 8 horas."),
});

/** Respuesta del cliente a «¿cuánto tiempo te llevó?». El enlace secreto (token) identifica el turno; se puede corregir la respuesta. */
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (blocked(`survey:${ip}`, 30, 10 * 60_000)) return NextResponse.json({ error: "Demasiados intentos. Probá en unos minutos." }, { status: 429 });
  recordFailure(`survey:${ip}`, 10 * 60_000);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  const { slug, token, minutes } = parsed.data;

  const appt = await prisma.appointment.findFirst({
    where: { surveyToken: token, business: { slug, learnDurations: true }, status: { in: ["CONFIRMED", "COMPLETED"] }, startAt: { lte: new Date() } },
    select: { id: true },
  });
  if (!appt) return NextResponse.json({ error: "Este enlace no es válido o el turno todavía no ocurrió." }, { status: 404 });

  await prisma.appointment.update({ where: { id: appt.id }, data: { actualDurationMin: minutes } });
  return NextResponse.json({ ok: true });
}
