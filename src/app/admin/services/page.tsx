import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { uploadsEnabled } from "@/lib/upload";
import { IconPicker } from "@/components/IconPicker";
import { ServiceIcon } from "@/components/ServiceIcon";
import { BUSINESS_TYPES, asBusinessType, type BusinessType } from "@/lib/service-icons";
import { saveService, archiveService, saveBusinessType } from "../actions";

type S = { name: string; description: string | null; priceCents: number; durationMin: number; iconKey: string | null; iconUrl: string | null };

function Fields({ s, type }: { s?: S; type: BusinessType }) {
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      <div className="sm:col-span-2">
        <label className="label">Nombre</label>
        <input name="name" required className="input" defaultValue={s?.name} />
      </div>
      <div>
        <label className="label">Precio</label>
        <input name="price" type="number" min={0} step="0.01" required className="input" defaultValue={s ? s.priceCents / 100 : undefined} />
      </div>
      <div>
        <label className="label">Duración (min)</label>
        <input name="durationMin" type="number" min={5} step={5} required className="input" defaultValue={s?.durationMin ?? 30} />
      </div>
      <div className="sm:col-span-4">
        <label className="label">Descripción</label>
        <input name="description" className="input" defaultValue={s?.description ?? ""} />
      </div>
      <div className="sm:col-span-4">
        <IconPicker type={type} iconKey={s?.iconKey ?? null} iconUrl={s?.iconUrl ?? null} enabled={uploadsEnabled()} />
      </div>
    </div>
  );
}

export default async function ServicesPage() {
  const { businessId } = await requireAdmin();
  const [services, biz] = await Promise.all([
    prisma.service.findMany({ where: { businessId }, orderBy: [{ active: "desc" }, { sortOrder: "asc" }] }),
    prisma.business.findUnique({ where: { id: businessId }, select: { businessType: true } }),
  ]);
  const type = asBusinessType(biz?.businessType);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Servicios</h1>

      <form action={saveBusinessType} className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="businessType">
            Rubro del negocio
          </label>
          <select id="businessType" name="businessType" defaultValue={type} className="input !w-auto">
            {Object.entries(BUSINESS_TYPES).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <button className="btn-ghost">Cambiar rubro</button>
        <p className="w-full text-xs text-neutral-500">Define los íconos sugeridos para tus servicios. No cambia nada más.</p>
      </form>

      <form action={saveService} className="card space-y-3">
        <h2 className="font-semibold">Nuevo servicio</h2>
        <Fields type={type} />
        <button className="btn">Crear</button>
      </form>

      {services.map((s) => (
        <div key={s.id} className={`card ${s.active ? "" : "opacity-60"}`}>
          <div className="mb-2 flex items-center gap-3">
            <ServiceIcon iconKey={s.iconKey} iconUrl={s.iconUrl} type={type} size={40} />
            <span className="font-semibold">{s.name}</span>
          </div>
          <form action={saveService} className="space-y-3">
            <input type="hidden" name="id" value={s.id} />
            <Fields s={s} type={type} />
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="active" defaultChecked={s.active} /> Visible para clientes
              </label>
              <button className="btn">Guardar</button>
            </div>
          </form>
          {s.active && (
            <form action={archiveService} className="mt-2">
              <input type="hidden" name="id" value={s.id} />
              <button className="text-sm text-red-600 underline">Eliminar</button>
            </form>
          )}
        </div>
      ))}
    </div>
  );
}
