import { NextResponse, after } from "next/server";
import { syncMpPayment } from "@/lib/payments";
import { dispatchDue } from "@/lib/outbox";

export const dynamic = "force-dynamic";

/**
 * Notificaciones de Mercado Pago (webhook y IPN). NO se confía en el contenido del aviso:
 * solo se toma el id del pago y se consulta a Mercado Pago con el token de la barbería (?b=).
 * Un aviso falso o repetido no puede aprobar nada; el cobro se aplica una sola vez.
 */
async function handle(req: Request) {
  const url = new URL(req.url);
  const businessId = url.searchParams.get("b");
  if (!businessId) return NextResponse.json({ error: "Falta la barbería" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as { type?: string; topic?: string; data?: { id?: string | number } } | null;
  const type = body?.type ?? url.searchParams.get("type") ?? url.searchParams.get("topic");
  const id = body?.data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id");
  if (type !== "payment" || !id) return NextResponse.json({ ok: true, ignored: true });

  try {
    const r = await syncMpPayment(businessId, String(id));
    if (r?.confirmedNow) after(() => dispatchDue().catch(console.error));
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("mp webhook", e);
    // 500 => Mercado Pago reintenta más tarde.
    return NextResponse.json({ error: "No se pudo procesar" }, { status: 500 });
  }
}

export const POST = handle;
export const GET = handle;
