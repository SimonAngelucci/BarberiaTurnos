import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifySignedId } from "@/lib/crypto";
import { expirePendingPayments } from "@/lib/payments";

export const dynamic = "force-dynamic";

/** Estado mínimo de un turno, protegido por el token firmado del link de retorno del checkout. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const id = q.get("a") ?? "";
  if (!id || !verifySignedId("appt", id, q.get("t") ?? undefined)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const a = await prisma.appointment.findUnique({ where: { id }, select: { businessId: true, status: true, paymentStatus: true } });
  if (!a) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  if (a.status === "PENDING_PAYMENT") await expirePendingPayments(a.businessId);
  const cur = a.status === "PENDING_PAYMENT" ? await prisma.appointment.findUnique({ where: { id }, select: { status: true, paymentStatus: true } }) : a;
  return NextResponse.json({ status: cur?.status, paymentStatus: cur?.paymentStatus });
}
