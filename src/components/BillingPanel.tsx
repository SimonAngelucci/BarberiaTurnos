"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { money } from "@/lib/format";
import { Modal } from "./Modal";
import { cancelPlan, chooseplan, type BillingState } from "@/app/admin/billing/actions";

export type PlanView = { id: string; name: string; description: string; priceCents: number; currency: string; maxBarbers: number | null; features: string[] };
export type PaymentView = { id: string; date: string; amountCents: number; currency: string; status: "APPROVED" | "REJECTED" | "PENDING"; detail: string | null };

type Props = {
  configured: boolean;
  exempt: boolean;
  statusLabel: string;
  status: "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";
  readonly: boolean;
  awaitingCharge: boolean;
  trialDaysLeft: number | null;
  trialEnds: string;
  nextCharge: string | null;
  accessUntil: string | null;
  mpStatus: string | null;
  initPoint: string | null;
  currentPlanId: string | null;
  canCancel: boolean;
  defaultEmail: string;
  plans: PlanView[];
  payments: PaymentView[];
};

const PAY_LABEL = { APPROVED: ["Aprobado", "bg-green-100 text-green-800"], REJECTED: ["Rechazado", "bg-red-100 text-red-800"], PENDING: ["Pendiente", "bg-amber-100 text-amber-800"] } as const;
const STATUS_TONE: Record<Props["status"], string> = {
  TRIAL: "bg-green-100 text-green-800",
  ACTIVE: "bg-green-100 text-green-800",
  PAST_DUE: "bg-red-100 text-red-800",
  CANCELED: "bg-amber-100 text-amber-800",
  EXPIRED: "bg-red-100 text-red-800",
};

export function BillingPanel(p: Props) {
  const [state, action, pending] = useActionState<BillingState, FormData>(chooseplan, null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelState, setCancelState] = useState<BillingState>(null);
  const [cancelling, startCancel] = useTransition();

  // Mercado Pago devuelve el link donde se autoriza la suscripción.
  useEffect(() => {
    if (state?.url) window.location.href = state.url;
  }, [state]);

  const authorized = p.mpStatus === "authorized" && p.status !== "CANCELED";
  const current = p.plans.find((x) => x.id === p.currentPlanId);

  return (
    <div className="space-y-4">
      {!p.configured && (
        <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Los cobros de suscripciones todavía no están activados en la plataforma. Cuando se activen vas a poder elegir tu plan acá.
        </p>
      )}

      {/* ---------- Estado ---------- */}
      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Tu suscripción</h2>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${p.exempt ? "bg-violet-100 text-violet-800" : STATUS_TONE[p.status]}`}>{p.exempt ? "Cuenta exenta" : p.statusLabel}</span>
        </div>

        {p.exempt ? (
          <p className="text-sm text-neutral-600">Tu cuenta no requiere suscripción: tenés acceso completo.</p>
        ) : (
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-neutral-500">Plan</dt>
              <dd className="font-medium">{current ? `${current.name} · ${money(current.priceCents, current.currency)}/mes` : "Sin plan elegido"}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">{p.status === "TRIAL" ? "Prueba gratis" : p.status === "CANCELED" ? "Acceso hasta" : "Próximo cobro"}</dt>
              <dd className="font-medium">
                {p.status === "TRIAL"
                  ? p.awaitingCharge
                    ? "Terminó: esperando el primer cobro"
                    : `Quedan ${p.trialDaysLeft} ${p.trialDaysLeft === 1 ? "día" : "días"} (hasta el ${p.trialEnds})`
                  : p.status === "CANCELED"
                    ? (p.accessUntil ?? "—")
                    : (p.nextCharge ?? "—")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Acceso</dt>
              <dd className="font-medium">{p.readonly ? "Solo lectura" : "Completo"}</dd>
            </div>
          </dl>
        )}

        {p.status === "TRIAL" && !p.exempt && (
          <p className="rounded-lg bg-green-50 p-3 text-sm text-green-900">
            {authorized
              ? `Tu suscripción está autorizada. No se cobra nada durante la prueba: el primer cobro de ${current ? money(current.priceCents, current.currency) : "tu plan"} será el ${p.trialEnds}.`
              : "No se cobra nada durante la prueba. Elegí un plan ahora y el primer cobro se hará automáticamente el día que termine."}
          </p>
        )}
        {p.status === "PAST_DUE" && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
            No pudimos cobrar tu último pago. Revisá el medio de pago en tu cuenta de Mercado Pago (sección Suscripciones): Mercado Pago reintenta el cobro solo y, apenas se aprueba, tu cuenta se reactiva automáticamente.
          </p>
        )}
        {p.status === "EXPIRED" && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
            Tu prueba terminó. Elegí un plan para recuperar el acceso completo y volver a recibir reservas.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {p.mpStatus === "pending" && p.initPoint && (
            <a href={p.initPoint} className="btn">
              Completar la autorización en Mercado Pago
            </a>
          )}
          <a href="/admin/billing?mp=return" className="btn-ghost">
            ↻ Actualizar estado
          </a>
          {p.canCancel && (
            <button type="button" className="btn-ghost !border-red-300 !text-red-600" onClick={() => setConfirmCancel(true)}>
              Cancelar suscripción
            </button>
          )}
        </div>
        {cancelState?.message && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{cancelState.message}</p>}
        {cancelState?.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{cancelState.error}</p>}
      </section>

      {/* ---------- Planes ---------- */}
      {!p.exempt && (
        <form action={action} className="space-y-3">
          <div className="card space-y-2">
            <h2 className="font-semibold">{authorized ? "Cambiar de plan" : "Elegí tu plan"}</h2>
            <div>
              <label className="label" htmlFor="payerEmail">
                Email de tu cuenta de Mercado Pago
              </label>
              <input id="payerEmail" name="payerEmail" type="email" required defaultValue={p.defaultEmail} className="input" disabled={authorized} />
              <p className="mt-1 text-xs text-neutral-500">El cobro es mensual y automático. Podés cancelar cuando quieras.</p>
            </div>
            {authorized && <input type="hidden" name="payerEmail" value={p.defaultEmail} />}
          </div>

          {p.plans.length === 0 ? (
            <p className="card text-sm text-neutral-500">Todavía no hay planes disponibles.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {p.plans.map((plan) => {
                const isCurrent = plan.id === p.currentPlanId && authorized;
                return (
                  <div key={plan.id} className={`card flex flex-col gap-3 ${isCurrent ? "!border-brand ring-2 ring-neutral-300" : ""}`}>
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-lg font-bold">{plan.name}</h3>
                        {isCurrent && <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[11px] font-semibold text-white">Tu plan</span>}
                      </div>
                      <div className="mt-1">
                        <span className="text-3xl font-extrabold">{money(plan.priceCents, plan.currency)}</span>
                        <span className="text-sm text-neutral-500"> /mes</span>
                      </div>
                      {plan.description && <p className="mt-1 text-sm text-neutral-500">{plan.description}</p>}
                    </div>
                    <ul className="flex-1 space-y-1 text-sm">
                      <li>✓ {plan.maxBarbers === null ? "Profesionales ilimitados" : `Hasta ${plan.maxBarbers} ${plan.maxBarbers === 1 ? "profesional" : "profesionales"}`}</li>
                      {plan.features.map((f) => (
                        <li key={f}>✓ {f}</li>
                      ))}
                    </ul>
                    <button name="planId" value={plan.id} className="btn w-full" disabled={!p.configured || pending || isCurrent}>
                      {isCurrent ? "Plan actual" : pending ? "Un momento…" : authorized ? "Cambiar a este plan" : "Elegir este plan"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {state?.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}
          {state?.message && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{state.message}</p>}
          {state?.url && <p className="rounded-lg bg-neutral-50 p-3 text-sm">Te llevamos a Mercado Pago para autorizar el pago…</p>}
        </form>
      )}

      {/* ---------- Historial ---------- */}
      <section className="card space-y-2">
        <h2 className="font-semibold">Historial de pagos</h2>
        {p.payments.length === 0 ? (
          <p className="text-sm text-neutral-500">Todavía no hay pagos. Durante la prueba gratis no se cobra nada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-neutral-500">
                <tr>
                  <th className="py-1 pr-3 font-medium">Fecha</th>
                  <th className="py-1 pr-3 font-medium">Monto</th>
                  <th className="py-1 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {p.payments.map((x) => (
                  <tr key={x.id}>
                    <td className="py-2 pr-3">{x.date}</td>
                    <td className="py-2 pr-3 tabular-nums">{money(x.amountCents, x.currency)}</td>
                    <td className="py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${PAY_LABEL[x.status][1]}`}>{PAY_LABEL[x.status][0]}</span>
                      {x.status === "REJECTED" && x.detail && <span className="ml-2 text-xs text-neutral-400">{x.detail.replace(/_/g, " ")}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal open={confirmCancel} onClose={() => !cancelling && setConfirmCancel(false)} title="¿Cancelar tu suscripción?" locked={cancelling}>
        <p className="text-sm">
          Se detienen los cobros automáticos. Vas a conservar el acceso completo hasta {p.status === "TRIAL" ? `el final de tu prueba (${p.trialEnds})` : (p.nextCharge ?? "el final del período pagado")}; después la cuenta pasa a solo lectura y deja de recibir reservas.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={() => setConfirmCancel(false)} disabled={cancelling}>
            Volver
          </button>
          <button
            type="button"
            disabled={cancelling}
            onClick={() =>
              startCancel(async () => {
                const r = await cancelPlan();
                setCancelState(r);
                setConfirmCancel(false);
              })
            }
            className="inline-flex items-center justify-center rounded-xl bg-red-600 px-4 py-2 font-medium text-white transition active:scale-[.98] disabled:opacity-50"
          >
            {cancelling ? "Cancelando…" : "Sí, cancelar"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
