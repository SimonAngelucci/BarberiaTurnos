import { requireSuperAdmin } from "@/lib/platform-auth";
import { loadOverview } from "@/lib/super-metrics";
import { money } from "@/lib/format";

function Stat({ label, value, hint, tone = "" }: { label: string; value: React.ReactNode; hint?: string; tone?: string }) {
  return (
    <div className="card">
      <div className={`text-3xl font-extrabold tabular-nums ${tone}`}>{value}</div>
      <div className="text-sm text-neutral-600">{label}</div>
      {hint && <div className="mt-0.5 text-xs text-neutral-400">{hint}</div>}
    </div>
  );
}

export default async function SuperOverviewPage() {
  await requireSuperAdmin();
  const o = await loadOverview();
  const { counts: c } = o;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Resumen de la plataforma</h1>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Barberías en total" value={o.totalBusinesses} hint={o.notStarted > 0 ? `${o.notStarted} sin iniciar (su prueba arranca al ingresar)` : undefined} />
        <Stat label="En prueba gratis" value={c.TRIAL} hint={o.endingSoon > 0 ? `${o.endingSoon} terminan en 7 días o menos` : undefined} tone="text-sky-700" />
        <Stat label="Pagando (activas)" value={c.ACTIVE} tone="text-green-700" />
        <Stat label="Ingreso mensual (MRR)" value={money(o.mrrCents, "ARS")} hint="Suma del precio de los planes activos" />
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Pago pendiente" value={c.PAST_DUE} tone={c.PAST_DUE ? "text-red-700" : ""} hint="Cobro fallido, en solo lectura" />
        <Stat label="Vencidas" value={c.EXPIRED} hint="Terminó la prueba sin contratar" />
        <Stat label="Canceladas" value={c.CANCELED} />
        <Stat label="Exentas" value={c.exempt} hint="Sin cobro (demo, socios)" />
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Altas últimos 7 días" value={o.new7} />
        <Stat label="Altas últimos 30 días" value={o.new30} />
        <Stat label="Llegaron con código de creador" value={o.withCreator} />
        <Stat label="Conversión a pago" value={o.conversion === null ? "—" : `${o.conversion}%`} hint="Activas sobre las que ya decidieron" />
      </section>
    </div>
  );
}
