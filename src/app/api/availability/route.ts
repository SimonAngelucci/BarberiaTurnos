import { NextResponse } from "next/server";
import { z } from "zod";
import { getBusiness } from "@/lib/db";
import { getAvailableSlots } from "@/lib/slots";

const schema = z.object({
  serviceId: z.string().min(1),
  barberId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET(req: Request) {
  const parsed = schema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });

  const business = await getBusiness();
  const slots = await getAvailableSlots({ businessId: business.id, ...parsed.data });
  return NextResponse.json({ slots, timezone: business.timezone });
}
