import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getNotifications, markNotificationsSeen } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/** Avisos del panel (la campanita consulta esto cada rato). /api no pasa por el middleware: se valida la sesión acá. */
export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Sesión vencida" }, { status: 401 });
  return NextResponse.json(await getNotifications(s.businessId, s.adminId), { headers: { "Cache-Control": "no-store" } });
}

/** Marca todo como leído. */
export async function POST() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Sesión vencida" }, { status: 401 });
  await markNotificationsSeen(s.adminId);
  return NextResponse.json({ ok: true });
}
