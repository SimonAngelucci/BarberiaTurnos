import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession } from "@/lib/auth";
import { createBusiness, EmailTakenError } from "@/lib/tenant";

const schema = z.object({
  name: z.string().trim().min(2, "Poné el nombre de tu barbería").max(60),
  email: z.string().trim().email("Email inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").max(100),
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
    const { business, admin } = await createBusiness(parsed.data);
    await createSession({ adminId: admin.id, businessId: business.id });
    return NextResponse.json({ ok: true, slug: business.slug }, { status: 201 });
  } catch (e) {
    if (e instanceof EmailTakenError) {
      return NextResponse.json({ error: "Ese email ya tiene una cuenta" }, { status: 409 });
    }
    console.error("register", e);
    return NextResponse.json({ error: "No pudimos crear la barbería. Intentá de nuevo." }, { status: 500 });
  }
}
