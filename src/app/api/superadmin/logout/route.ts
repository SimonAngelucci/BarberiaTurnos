import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SUPER_COOKIE } from "@/lib/platform-auth";

export async function POST() {
  (await cookies()).delete(SUPER_COOKIE);
  return NextResponse.json({ ok: true });
}
