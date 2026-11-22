import { PageHero } from "@/components/ui/PageHero";
import { QuickLinks, PANEL_SHORTCUTS as GO } from "@/components/ui/QuickLinks";
import { IconButton } from "@/components/ui/IconButton";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { uploadsEnabled } from "@/lib/upload";
import { IconPicker } from "@/components/IconPicker";
import { SaveForm } from "@/components/SaveForm";
import { Collapsible } from "@/components/ui/Collapsible";
import { Icon } from "@/components/ui/Icon";
import { money } from "@/lib/format";
import { ServiceIcon } from "@/components/ServiceIcon";
import { BUSINESS_TYPES, asBusinessType, type BusinessType } from "@/lib/service-icons";
import { saveService, archiveService, saveBusinessType } from "../actions";

type S = { name: string; description: string | null; priceCents: number; durationMin: number; iconKey: string | null; iconUrl: string | null; comingSoon: boolean };

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
        <input name="durationMin" type="number" min={5} step={5} required className="input" defaultValue={s?.durationMin} />
      </div>
      <div className="sm:col-span-4">
        <label className="label">Descripción</label>
        <input name="description" className="input" defaultValue={s?.description ?? ""} />
      </div>
      <label className="flex items-start gap-2 text-sm sm:col-span-4">
        <input type="checkbox" name="comingSoon" defaultChecked={s?.comingSoon ?? false} className="mt-1" />
        <span>
          <span className="font-medium">Próximamente</span>
          <span className="block text-xs text-neutral-500">Se muestra en tu página con la etiqueta «Próximamente», pero los clientes todavía no pueden reservarlo.</span>
        </span>
      </label>
      <div className="sm:col-span-4">
        <IconPicker type={type} iconKey={s?.iconKey ?? null} iconUrl={s?.iconUrl ?? null} enabled={uploadsEnabled()} />
      </div>
    </div>
  );
}

export default async function ServicesPage() {
  const { businessId } = await requireAdmin();
  const [services, biz] = await Promise.all([
    prisma.service.findMany({ where: { businessId, archived: false }, orderBy: [{ active: "desc" }, { sortOrder: "asc" }] }),
    prisma.business.findUnique({ where: { id: businessId }, select: { businessType: true, currency: true } }),
  ]);
  const type = asBusinessType(biz?.businessType);
  const currency = biz?.currency ?? "ARS";

  return (
    <div className="space-y-4">
      <PageHero title="Servicios" subtitle="Lo que ofrecés, con su precio y duración. Tocá un servicio para editarlo.">
        <QuickLinks items={[GO.horarios]} />
      </PageHero>

      <SaveForm action={saveBusinessType} className="card flex flex-wrap items-end gap-3" successText="Rubro cambiado">
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
      </SaveForm>

      {services.length === 0 && (
        <div className="card flex flex-col items-center gap-2 py-8 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
            <Icon name="scissors" size={26} />
          </span>
          <h2 className="text-lg font-bold">Todavía no tenés servicios</h2>
          <p className="max-w-sm text-sm text-neutral-500">Creá tu primer servicio con nombre, precio y duración: es lo que tus clientes van a poder reservar en tu página.</p>
        </div>
      )}

      {/* Los formularios no se ven de entrada: se abren al elegir el servicio (acordeón). Quedan montados, así que lo escrito no se pierde al cerrar. */}
      <Collapsible
        className="card"
        defaultOpen={services.length === 0}
        leading={
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-700">
            <Icon name="plus" />
          </span>
        }
        title={services.length === 0 ? "Crear servicio" : "Agregar servicio"}
        summary="Nombre, precio, duración e ícono"
      >
        <SaveForm action={saveService} className="space-y-3" successText="Servicio creado" resetOnSuccess>
          <Fields type={type} />
          <button className="btn">Crear servicio</button>
        </SaveForm>
      </Collapsible>

      {services.map((s) => (
        <Collapsible
          key={s.id}
          className={`card ${s.active ? "" : "opacity-70"}`}
          leading={<ServiceIcon iconKey={s.iconKey} iconUrl={s.iconUrl} type={type} size={40} />}
          title={s.name}
          summary={`${s.durationMin} min · ${money(s.priceCents, currency)}`}
          trailing={
            <span className="flex flex-wrap items-center justify-end gap-1.5">
              <span className="hidden items-center gap-1 text-xs font-medium text-neutral-500 sm:inline-flex">
                <Icon name="pencil" size={13} />
                Editar
              </span>
              {s.comingSoon && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Próximamente</span>}
              {!s.active && <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-700">Oculto</span>}
            </span>
          }
        >
          <SaveForm action={saveService} className="space-y-3" successText="Servicio guardado">
            <input type="hidden" name="id" value={s.id} />
            <Fields s={s} type={type} />
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="active" defaultChecked={s.active} /> Visible para clientes
              </label>
              <button className="btn">Guardar</button>
            </div>
          </SaveForm>
          <SaveForm action={archiveService} className="mt-2" successText="Servicio eliminado" confirm="¿Eliminar este servicio? Los turnos ya agendados no se tocan.">
            <input type="hidden" name="id" value={s.id} />
            <IconButton type="submit" icon="trash" label="Eliminar servicio" variant="danger" />
          </SaveForm>
        </Collapsible>
      ))}    </div>
  );
}
