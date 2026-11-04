import { NextResponse } from "next/server";
import {
  BillingError,
  applyAuthorizedPayment,
  applyPreapproval,
  getAuthorizedPayment,
  getPreapproval,
  verifyWebhookSignature,
} from "@/lib/mp-subscriptions";

export const dynamic = "force-dynamic";

/**
 * Avisos de Mercado Pago sobre las SUSCRIPCIONES a la plataforma (alta/baja/pausa y cobros mensuales).
 * No se confía en el contenido del aviso: se toma el id y se consulta el recurso a Mercado Pago con el token
 * de la plataforma. Un aviso falso o repetido no puede activar una cuenta ni duplicar un cobro.
 * Se configura una sola vez en Mercado Pago → Tus integraciones → Webhooks (eventos de «Planes y suscripciones»).
 */
async function handle(req: Request) {
  const url = new URL(req.url);
  const body = (await req.json().catch(() => null)) as { type?: string; topic?: string; data?: { id?: string | number } } | null;
  const type = body?.type ?? url.searchParams.get("type") ?? url.searchParams.get("topic");
  const rawId = body?.data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id");
  const id = rawId == null ? null : String(rawId);

  // La firma se valida con el id que viene en la URL (data.id), como documenta Mercado Pago.
  if (!verifyWebhookSignature(req.headers, url.searchParams.get("data.id") ?? id)) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }
  if (!type || !id) return NextResponse.json({ ok: true, ignored: true });

  try {
    if (type === "subscription_preapproval" || type === "preapproval") {
      await applyPreapproval(await getPreapproval(id));
    } else if (type === "subscription_authorized_payment" || type === "authorized_payment") {
      await applyAuthorizedPayment(await getAuthorizedPayment(id));
    } else {
      return NextResponse.json({ ok: true, ignored: true });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("subscription webhook", type, id, e);
    // 5xx => Mercado Pago reintenta más tarde.
    return NextResponse.json({ error: e instanceof BillingError ? e.message : "No se pudo procesar" }, { status: 500 });
  }
}

export const POST = handle;
export const GET = handle;
