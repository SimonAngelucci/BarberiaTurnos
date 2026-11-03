import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { saveService, archiveService } from "../actions";

function Fields({ s }: { s?: { name: string; description: string | null; priceCents: number; durationMin: number } }) {
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
    </div>
  );
}

export default async function ServicesPage() {
  const { businessId } = await requireAdmin();
  const services = await prisma.service.findMany({ where: { businessId }, orderBy: [{ active: "desc" }, { sortOrder: "asc" }] });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Servicios</h1>

      <form action={saveService} className="card space-y-3">
        <h2 className="font-semibold">Nuevo servicio</h2>
        <Fields />
        <button className="btn">Crear</button>
      </form>

      {services.map((s) => (
        <div key={s.id} className={`card ${s.active ? "" : "opacity-60"}`}>
          <form action={saveService} className="space-y-3">
            <input type="hidden" name="id" value={s.id} />
            <Fields s={s} />
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
