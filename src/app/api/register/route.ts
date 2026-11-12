import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createBusiness, EmailTakenError } from "@/lib/tenant";

const schema = z.object({
  name: z.string().trim().min(2, "Poné el nombre de tu negocio").max(60),
  email: z.string().trim().email("Email inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").max(100),
  /** Código de creador/influencer (opcional). */
  creatorCode: z.string().trim().max(30).optional(),
});

export async function POST(req: Request) {
  if (process.env.ALLOW_REGISTRATION === "false") {
    return NextResponse.json({ error: "El registro está deshabilitado" }, { status: 403 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }
  try {
    // Código de creador: si lo ingresó tiene que existir y estar activo (así corrige un error de tipeo en el momento).
    let creator: { id: string; code: string } | null = null;
    const code = parsed.data.creatorCode?.toUpperCase().replace(/\s+/g, "");
    if (code) {
      const found = await prisma.creator.findFirst({ where: { code, active: true }, select: { id: true, code: true } });
      if (!found) return NextResponse.json({ error: "Ese código de creador no existe o ya no está activo." }, { status: 400 });
      creator = found;
    }

    const { business, admin } = await createBusiness({ name: parsed.data.name, email: parsed.data.email, password: parsed.data.password, creator });
    await createSession({ adminId: admin.id, businessId: business.id });
    return NextResponse.json({ ok: true, slug: business.slug }, { status: 201 });
  } catch (e) {
    if (e instanceof EmailTakenError) {
      return NextResponse.json({ error: "Ese email ya tiene una cuenta" }, { status: 409 });
    }
    console.error("register", e);
    return NextResponse.json({ error: "No pudimos crear tu cuenta. Intentá de nuevo." }, { status: 500 });
  }
}
