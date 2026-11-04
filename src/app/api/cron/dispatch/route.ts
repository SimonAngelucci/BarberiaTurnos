import { NextResponse } from "next/server";
import { dispatchDue } from "@/lib/outbox";
import { expirePendingPayments } from "@/lib/payments";
import { syncSubscriptionStates } from "@/lib/billing";
import { reconcileSubscriptions } from "@/lib/mp-subscriptions";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const expired = await expirePendingPayments();
  // Suscripciones: pasa a la base los vencimientos (fin de prueba, período impago) y refresca de a pocas
  // las que hace rato no se sincronizan con Mercado Pago (respaldo por si se perdió un webhook).
  // Un fallo acá nunca debe frenar el envío de recordatorios.
  const [subsChanged, subsSynced] = await Promise.all([syncSubscriptionStates().catch((e) => (console.error("sync subs", e), 0)), reconcileSubscriptions().catch((e) => (console.error("reconcile", e), 0))]);
  return NextResponse.json({ ...(await dispatchDue(100)), expired, subsChanged, subsSynced });
}
