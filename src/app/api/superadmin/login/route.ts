import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSuperSession } from "@/lib/platform-auth";
import { blocked, clientIp, recordFailure } from "@/lib/rate-limit";

const schema = z.object({ email: z.string().email(), password: z.string().min(1).max(200) });
const WINDOW = 15 * 60_000;
const MAX_FAILS = 5;

export async function POST(req: Request) {
  const key = `sa-login:${clientIp(req)}`;
  if (blocked(key, MAX_FAILS, WINDOW)) {
    return NextResponse.json({ error: "Demasiados intentos. Esperá unos minutos." }, { status: 429 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const admin = await prisma.platformAdmin.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  // Mismo costo de hash y mismo mensaje exista o no el usuario.
  const hash = admin?.passwordHash ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi";
  const ok = await bcrypt.compare(parsed.data.password, hash);
  if (!admin || !ok) {
    recordFailure(key, WINDOW);
    return NextResponse.json({ error: "Email o contraseña incorrectos" }, { status: 401 });
  }
  await createSuperSession(admin.id);
  return NextResponse.json({ ok: true });
}
