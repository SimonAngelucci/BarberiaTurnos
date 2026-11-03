import { NextResponse } from "next/server";
import { dispatchDue } from "@/lib/outbox";
import { expirePendingPayments } from "@/lib/payments";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const expired = await expirePendingPayments();
  return NextResponse.json({ ...(await dispatchDue(100)), expired });
}
