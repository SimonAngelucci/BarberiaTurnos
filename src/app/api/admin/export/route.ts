import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Exporta los datos de la cuenta en JSON. Nunca incluye contraseñas ni credenciales (hash, tokens de Mercado Pago). */
export async function GET() {
  const s = await getSession(); // /api no pasa por el middleware: se valida acá
  if (!s) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const businessId = s.businessId;

  const [business, admin, profile, photos, services, barbers, customers, appointments, reviews, timeOffs, subscription] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId }, omit: { mpAccessToken: true } }),
    prisma.adminUser.findUnique({ where: { id: s.adminId }, select: { email: true, name: true, emailNotifications: true, createdAt: true } }),
    prisma.businessProfile.findUnique({ where: { businessId } }),
    prisma.businessPhoto.findMany({ where: { businessId }, orderBy: { sortOrder: "asc" } }),
    prisma.service.findMany({ where: { businessId }, orderBy: { sortOrder: "asc" } }),
    prisma.barber.findMany({ where: { businessId }, include: { workingHours: true } }),
    prisma.customer.findMany({ where: { businessId } }),
    prisma.appointment.findMany({ where: { businessId }, orderBy: { startAt: "asc" }, include: { payments: true } }),
    prisma.review.findMany({ where: { businessId }, orderBy: { createdAt: "asc" } }),
    prisma.timeOff.findMany({ where: { businessId } }),
    prisma.subscription.findUnique({ where: { businessId }, include: { payments: true } }),
  ]);

  const body = {
    exportedAt: new Date().toISOString(),
    account: admin,
    business,
    profile,
    photos,
    services,
    barbers,
    timeOffs,
    customers,
    appointments,
    reviews,
    subscription,
  };

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="datos-${business?.slug ?? "cuenta"}-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
