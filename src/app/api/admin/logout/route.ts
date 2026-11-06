import { NextResponse } from "next/server";
import { endCurrentSession } from "@/lib/auth";

export async function POST() {
  await endCurrentSession();
  return NextResponse.json({ ok: true });
}
