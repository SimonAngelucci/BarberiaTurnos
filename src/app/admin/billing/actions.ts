"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth"; // NO requireWritable: estas acciones tienen que funcionar justamente cuando la cuenta está en solo lectura
import { BillingError, cancelSubscriptionFor, startSubscriptionFor } from "@/lib/mp-subscriptions";

export type BillingState = { ok: boolean; url?: string; message?: string; error?: string } | null;

async function origin() {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
}

const fail = (e: unknown): BillingState => {
  if (e instanceof BillingError) return { ok: false, error: e.message };
  console.error("billing action", e);
  return { ok: false, error: "No se pudo completar la operación. Intentá de nuevo." };
};

/** Elegir un plan (lleva a Mercado Pago a autorizar) o cambiar de plan si ya hay una suscripción autorizada. */
export async function chooseplan(_prev: BillingState, formData: FormData): Promise<BillingState> {
  const { businessId } = await requireAdmin();
  const parsed = z.object({ planId: z.string().min(1), payerEmail: z.string().trim().email("Ingresá un email válido") }).safeParse({
    planId: formData.get("planId"),
    payerEmail: formData.get("payerEmail"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    const r = await startSubscriptionFor({ businessId, planId: parsed.data.planId, payerEmail: parsed.data.payerEmail, origin: await origin() });
    revalidatePath("/admin/billing");
    return r.kind === "redirect" ? { ok: true, url: r.url } : { ok: true, message: r.message };
  } catch (e) {
    return fail(e);
  }
}

export async function cancelPlan(): Promise<BillingState> {
  const { businessId } = await requireAdmin();
  try {
    await cancelSubscriptionFor(businessId);
    revalidatePath("/admin/billing");
    revalidatePath("/admin", "layout");
    return { ok: true, message: "Suscripción cancelada. Conservás el acceso hasta el final del período ya pagado." };
  } catch (e) {
    return fail(e);
  }
}
