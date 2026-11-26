import { DateTime } from "luxon";
import { PageHero } from "@/components/ui/PageHero";
import { Icon } from "@/components/ui/Icon";
import { Collapsible } from "@/components/ui/Collapsible";
import { SaveForm } from "@/components/SaveForm";
import { IconButton } from "@/components/ui/IconButton";
import { prisma, getBusinessById } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { money } from "@/lib/format";
import { discountBadge } from "@/lib/discounts";
import { deleteDiscount, saveDiscount, toggleDiscount } from "./actions";

export const dynamic = "force-dynamic";

const DAYS = [
  { n: 1, l: "Lun" },
  { n: 2, l: "Mar" },
  { n: 3, l: "Mié" },
  { n: 4, l: "Jue" },
  { n: 5, l: "Vie" },
  { n: 6, l: "Sáb" },
  { n: 0, l: "Dom" },
];
const hhmm = (m: number | null) => (m === null ? "" : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);

type D = Awaited<ReturnType<typeof prisma.discount.findMany>>[number];

function Fields({ d, services, tz, currency }: { d?: D; services: { id: string; name: string }[]; tz: string; currency: string }) {
  const iso = (x: Date | null | undefined) => (x ? DateTime.fromJSDate(x).setZone(tz).toISODate() : "");
  const all = !d || d.serviceIds.length === 0;
  return (
    <div className="space-y-3">
      {d && <input type="hidden" name="id" value={d.id} />}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <label className="label">Nombre de la promoción</label>
          <input name="name" required maxLength={60} className="input" defaultValue={d?.name} placeholder="Ej: Martes de descuento" />
        </div>
        <div>
          <label className="label">Tipo</label>
          <select name="kind" className="input" defaultValue={d?.kind ?? "PERCENT"}>
            <option value="PERCENT">Porcentaje (%)</option>
            <option value="FIXED">Monto fijo ({currency})</option>
          </select>
        </div>
        <div>
          <label className="label">Valor</label>
          <input name="value" type="number" min={1} step="any" required className="input" defaultValue={d ? (d.kind === "PERCENT" ? d.value : d.value / 100) : undefined} placeholder="20" />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="label">Servicios</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="allServices" defaultChecked={all} /> Todos los servicios
        </label>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {services.map((s) => (
            <label key={s.id} className="flex items-center gap-1.5">
              <input type="checkbox" name="serviceId" value={s.id} defaultChecked={d?.serviceIds.includes(s.id)} /> {s.name}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted">Si elegís servicios puntuales, destildá «Todos los servicios».</p>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Desde (opcional)</label>
          <input name="startDate" type="date" className="input" defaultValue={iso(d?.startsAt) ?? ""} />
        </div>
        <div>
          <label className="label">Hasta (opcional)</label>
          <input name="endDate" type="date" className="input" defaultValue={iso(d?.endsAt) ?? ""} />
        </div>
      </div>
      <p className="-mt-1 text-xs text-muted">Las fechas se comparan con el día del turno.</p>

      <fieldset className="space-y-2">
        <legend className="label">Días en que aplica (opcional)</legend>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((x) => (
            <label key={x.n} className="cursor-pointer">
              <input type="checkbox" name="weekday" value={x.n} defaultChecked={d?.weekdays.includes(x.n)} className="peer sr-only" />
              <span className="block rounded-full bg-surface-muted px-3 py-1.5 text-sm font-semibold peer-checked:bg-primary peer-checked:text-on-primary peer-focus-visible:ring-2">{x.l}</span>
            </label>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Desde la hora (opcional)</label>
            <input name="startTime" type="time" className="input" defaultValue={hhmm(d?.startMin ?? null)} />
          </div>
          <div>
            <label className="label">Hasta la hora (opcional)</label>
            <input name="endTime" type="time" className="input" defaultValue={hhmm(d?.endMin ?? null)} />
          </div>
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Código de cupón (opcional)</label>
          <input name="coupon" maxLength={20} className="input uppercase" defaultValue={d?.couponCode ?? ""} placeholder="FADE10" autoCapitalize="characters" />
        </div>
        <div>
          <label className="label">Límite de usos (opcional)</label>
          <input name="maxUses" type="number" min={1} className="input" defaultValue={d?.maxUses ?? ""} placeholder="Sin límite" />
        </div>
      </div>
      <p className="-mt-1 text-xs text-muted">Con cupón, el descuento solo se aplica si el cliente lo escribe al reservar. Sin cupón, se aplica solo.</p>

      {d && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={d.active} /> Activo (destildalo para pausarlo)
        </label>
      )}
    </div>
  );
}

function summary(d: D, tz: string, currency: string, services: Map<string, string>) {
  const parts: string[] = [];
  parts.push(d.serviceIds.length === 0 ? "Todos los servicios" : d.serviceIds.map((id) => services.get(id) ?? "—").join(", "));
  if (d.weekdays.length) parts.push(DAYS.filter((x) => d.weekdays.includes(x.n)).map((x) => x.l).join(" · "));
  if (d.startMin !== null || d.endMin !== null) parts.push(`${hhmm(d.startMin) || "00:00"} a ${hhmm(d.endMin) || "24:00"} hs`);
  const f = (x: Date) => DateTime.fromJSDate(x).setZone(tz).toFormat("dd/MM/yy");
  if (d.startsAt || d.endsAt) parts.push(`${d.startsAt ? `desde ${f(d.startsAt)}` : ""}${d.startsAt && d.endsAt ? " " : ""}${d.endsAt ? `hasta ${f(d.endsAt)}` : ""}`);
  return parts.join(" · ");
}

export default async function PromocionesPage() {
  const { businessId } = await requireAdmin();
  const [b, discounts, services] = await Promise.all([
    getBusinessById(businessId),
    prisma.discount.findMany({ where: { businessId }, orderBy: [{ active: "desc" }, { createdAt: "desc" }] }),
    prisma.service.findMany({ where: { businessId, archived: false }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);
  const names = new Map(services.map((s) => [s.id, s.name]));
  const now = new Date();

  return (
    <div className="space-y-4">
      <PageHero title="Promociones" back={{ href: "/admin/services", label: "Volver a Servicios" }} subtitle="Los descuentos se muestran en tu página con el precio original tachado. El precio final siempre lo calcula el sistema al reservar." />

      <Collapsible
        className="card"
        defaultOpen={discounts.length === 0}
        leading={
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-muted">
            <Icon name="plus" />
          </span>
        }
        title="Agregar descuento"
        summary="Porcentaje o monto fijo, con cupón opcional"
      >
        <SaveForm action={saveDiscount} className="space-y-3" successText="Descuento creado" resetOnSuccess>
          <Fields services={services} tz={b.timezone} currency={b.currency} />
          <button className="btn">Crear descuento</button>
        </SaveForm>
      </Collapsible>

      {discounts.length === 0 && <p className="card text-sm text-muted">Todavía no hay descuentos.</p>}

      {discounts.map((d) => {
        const expired = !!d.endsAt && d.endsAt < now;
        const exhausted = d.maxUses !== null && d.usedCount >= d.maxUses;
        const state = !d.active ? "Pausado" : expired ? "Vencido" : exhausted ? "Agotado" : "Activo";
        return (
          <div key={d.id} className={`card space-y-3 ${state === "Activo" ? "" : "opacity-75"}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-primary px-2.5 py-0.5 text-sm font-bold text-on-primary">{discountBadge(d, (c) => money(c, b.currency))}</span>
                  <h2 className="font-semibold">{d.name}</h2>
                </div>
                <p className="mt-1 text-sm text-muted">{summary(d, b.timezone, b.currency, names)}</p>
                {d.couponCode && (
                  <p className="mt-1 text-sm">
                    Cupón <span className="rounded bg-surface-muted px-1.5 py-0.5 font-mono font-semibold">{d.couponCode}</span>
                    <span className="text-muted"> · {d.usedCount}{d.maxUses !== null ? ` de ${d.maxUses}` : ""} {d.usedCount === 1 ? "uso" : "usos"}</span>
                  </p>
                )}
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${state === "Activo" ? "bg-primary text-on-primary" : "bg-surface-muted text-muted"}`}>{state}</span>
            </div>

            <Collapsible className="rounded-2xl border border-black/10 p-2.5" title="Editar" leading={<Icon name="pencil" size={16} />} headerClassName="text-sm">
              <SaveForm action={saveDiscount} className="mt-3 space-y-3" successText="Descuento guardado">
                <Fields d={d} services={services} tz={b.timezone} currency={b.currency} />
                <button className="btn">Guardar</button>
              </SaveForm>
            </Collapsible>

            <div className="flex flex-wrap items-center gap-2">
              <SaveForm action={toggleDiscount} successText={d.active ? "Pausado" : "Activado"}>
                <input type="hidden" name="id" value={d.id} />
                <button className="btn-ghost !rounded-full">{d.active ? "Pausar" : "Activar"}</button>
              </SaveForm>
              <SaveForm action={deleteDiscount} successText="Descuento eliminado" confirm="¿Eliminar este descuento? Los turnos ya reservados conservan su precio.">
                <input type="hidden" name="id" value={d.id} />
                <IconButton type="submit" icon="trash" label="Eliminar descuento" variant="danger" />
              </SaveForm>
            </div>
          </div>
        );
      })}
    </div>
  );
}
