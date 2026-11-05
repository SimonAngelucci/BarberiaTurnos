import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { blocked, clientIp, recordFailure } from "@/lib/rate-limit";
import { MAX_PENDING_REVIEWS, reviewFields } from "@/lib/profile";

export const dynamic = "force-dynamic";

const HOUR = 3_600_000;
const schema = z.object({
  slug: z.string().min(1).max(60),
  ...reviewFields,
  /** Campo trampa: está oculto para las personas, los bots lo completan. */
  website: z.string().max(200).optional(),
});

/**
 * Un cliente envía una reseña. Nunca se publica sola: queda PENDING hasta que el administrador la aprueba.
 * Defensas contra abuso: tope por IP, campo trampa, tope de pendientes por barbería, texto plano (React lo escapa al mostrarlo).
 */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  const d = parsed.data;

  if (d.website) return NextResponse.json({ ok: true }); // bot: se responde "ok" sin guardar nada

  const key = `review:${clientIp(req)}`;
  if (blocked(key, 3, HOUR)) return NextResponse.json({ error: "Enviaste varias reseñas hace poco. Probá de nuevo más tarde." }, { status: 429 });

  const business = await prisma.business.findUnique({ where: { slug: d.slug.toLowerCase() }, select: { id: true, profile: { select: { reviewsEnabled: true } } } });
  if (!business?.profile?.reviewsEnabled) return NextResponse.json({ error: "Esta barbería no está recibiendo reseñas." }, { status: 403 });

  const pending = await prisma.review.count({ where: { businessId: business.id, status: "PENDING" } });
  if (pending >= MAX_PENDING_REVIEWS) return NextResponse.json({ error: "Hay muchas reseñas esperando aprobación. Probá de nuevo más adelante." }, { status: 429 });

  await prisma.review.create({ data: { businessId: business.id, authorName: d.authorName, rating: d.rating, comment: d.comment, status: "PENDING", source: "CLIENT" } });
  recordFailure(key, HOUR); // cuenta cada envío
  return NextResponse.json({ ok: true }, { status: 201 });
}
