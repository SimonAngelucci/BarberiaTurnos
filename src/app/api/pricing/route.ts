import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma, getBusinessBySlug } from "@/lib/db";
import { loadRules } from "@/lib/discount-db";
import { COUPON_MESSAGE, discountBadge, priceFor } from "@/lib/discounts";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";

const schema = z.object({
  slug: z.string().min(1).max(60),
  serviceId: z.string().min(1),
  startAt: z.string().min(1),
  coupon: z.string().max(40).optional(),
});

/** Vista previa del precio (descuento y cupón) para mostrar en pantalla. El precio que vale es el que calcula el servidor al reservar. */
export async function GET(req: Request) {
  const parsed = schema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
  const { slug, serviceId, startAt, coupon } = parsed.data;
  const business = await getBusinessBySlug(slug);
  const when = new Date(startAt);
  if (!business || Number.isNaN(when.getTime())) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  const service = await prisma.service.findFirst({ where: { id: serviceId, businessId: business.id, active: true, comingSoon: false }, select: { priceCents: true } });
  if (!service) return NextResponse.json({ error: "Servicio no disponible" }, { status: 404 });

  const r = priceFor({ rules: await loadRules(business.id), serviceId, priceCents: service.priceCents, startAt: when, tz: business.timezone, coupon });
  return NextResponse.json({
    originalCents: r.originalCents,
    discountCents: r.discountCents,
    finalCents: r.finalCents,
    badge: r.discount ? discountBadge(r.discount, (c) => money(c, business.currency)) : null,
    name: r.discount?.name ?? null,
    coupon: r.coupon,
    couponMessage: COUPON_MESSAGE[r.coupon],
  });
}
