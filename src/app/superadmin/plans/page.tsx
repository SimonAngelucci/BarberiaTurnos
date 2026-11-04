import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/platform-auth";
import { ActionForm } from "@/components/ActionForm";
import { createPlan, seedDefaultPlans, updatePlan } from "../actions";

type P = { name: string; description: string; priceCents: number; currency: string; maxBarbers: number | null; features: string[]; sortOrder: number };

function PlanFields({ p }: { p?: P }) {
  return (
    <div className="grid gap-3 sm:grid-cols-6">
      <div className="sm:col-span-2">
        <label className="label">Nombre</label>
        <input name="name" required maxLength={40} className="input" defaultValue={p?.name} placeholder="Pro" />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Precio mensual</label>
        <input name="price" type="number" min={1} step="0.01" required className="input" defaultValue={p ? p.priceCents / 100 : undefined} placeholder="28000" />
      </div>
      <div>
        <label className="label">Moneda</label>
        <input name="currency" maxLength={3} className="input uppercase" defaultValue={p?.currency ?? "ARS"} />
      </div>
      <div>
        <label className="label">Orden</label>
        <input name="sortOrder" type="number" min={0} className="input" defaultValue={p?.sortOrder ?? 0} />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Tope de barberos</label>
        <input name="maxBarbers" type="number" min={1} className="input" defaultValue={p?.maxBarbers ?? ""} placeholder="Vacío = ilimitados" />
      </div>
      <div className="sm:col-span-4">
        <label className="label">Descripción corta</label>
        <input name="description" maxLength={200} className="input" defaultValue={p?.description} />
      </div>
      <div className="sm:col-span-6">
        <label className="label">Características (una por línea)</label>
        <textarea name="features" rows={4} className="input" defaultValue={p?.features.join("\n")} placeholder={"Reservas online\nRecordatorios por WhatsApp"} />
      </div>
    </div>
  );
}

export default async function SuperPlansPage() {
  await requireSuperAdmin();
  const plans = await prisma.plan.findMany({ orderBy: [{ sortOrder: "asc" }, { priceCents: "asc" }], include: { _count: { select: { subscriptions: true } } } });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Planes de suscripción</h1>
        <p className="text-sm opacity-70">
          Cambiar el precio de un plan afecta a quienes lo contraten o cambien de plan desde ahora. Las suscripciones en curso conservan el monto que autorizaron en Mercado Pago. Los planes no se borran: se desactivan.
        </p>
      </div>

      {plans.length === 0 && (
        <form action={seedDefaultPlans} className="card flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">Todavía no hay planes. Podés empezar con tres de ejemplo (Básico, Pro y Premium) y editar sus precios después.</p>
          <button className="btn">Crear planes de ejemplo</button>
        </form>
      )}

      <section className="card space-y-3">
        <h2 className="font-semibold">Nuevo plan</h2>
        <ActionForm action={createPlan} submitLabel="Crear plan" resetOnSuccess>
          <PlanFields />
        </ActionForm>
      </section>

      {plans.map((p) => (
        <section key={p.id} className={`card space-y-3 ${p.active ? "" : "opacity-70"}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">
              {p.name} {!p.active && <span className="ml-1 rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium">Desactivado</span>}
            </h2>
            <span className="text-sm text-neutral-500">{p._count.subscriptions} {p._count.subscriptions === 1 ? "suscripción" : "suscripciones"}</span>
          </div>
          <ActionForm action={updatePlan} submitLabel="Guardar cambios">
            <input type="hidden" name="id" value={p.id} />
            <PlanFields p={p} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={p.active} /> Visible para las barberías (los planes desactivados no se pueden contratar)
            </label>
          </ActionForm>
        </section>
      ))}
    </div>
  );
}
