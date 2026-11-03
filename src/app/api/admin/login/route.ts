import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const admin = await prisma.adminUser.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  // Mismo mensaje y mismo costo de hash exista o no el usuario
  const hash = admin?.passwordHash ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi";
  const ok = await bcrypt.compare(parsed.data.password, hash);
  if (!admin || !ok) return NextResponse.json({ error: "Email o contraseña incorrectos" }, { status: 401 });

  await createSession({ adminId: admin.id, businessId: admin.businessId });
  return NextResponse.json({ ok: true });
}
