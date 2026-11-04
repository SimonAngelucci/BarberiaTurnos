import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { getAccess } from "@/lib/billing";
import { uploadsEnabled } from "@/lib/upload";
import { ImageField } from "@/components/ImageField";
import { DeleteBarberButton } from "@/components/DeleteBarberButton";
import { saveBarber } from "../actions";

type B = { id: string; name: string; bio: string | null; photoUrl: string | null; active: boolean };

function BarberForm({ b, enabled }: { b?: B; enabled: boolean }) {
  return (
    <form action={saveBarber} className="space-y-3">
      {b && <input type="hidden" name="id" value={b.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Nombre</label>
          <input name="name" required maxLength={60} className="input" defaultValue={b?.name} placeholder="Ej: Martín" />
        </div>
        <ImageField name="photoUrl" removeName="removePhoto" kind="barber" label="Foto de perfil" currentUrl={b?.photoUrl ?? null} enabled={enabled} crop />
      </div>
      <div>
        <label className="label">Descripción (especialidades, experiencia…)</label>
        <textarea
          name="bio"
          rows={3}
          maxLength={400}
          className="input"
          defaultValue={b?.bio ?? ""}
          placeholder="Ej: 8 años de experiencia. Especialista en fades y barba clásica."
        />
      </div>
      <div className="flex items-center gap-4">
        {b && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={b.active} /> Visible para clientes
          </label>
        )}
        <button className="btn">{b ? "Guardar" : "Agregar barbero"}</button>
      </div>
    </form>
  );
}

export default async function BarbersPage() {
  const { businessId } = await requireAdmin();
  const barbers = await prisma.barber.findMany({ where: { businessId }, orderBy: [{ active: "desc" }, { name: "asc" }] });
  const enabled = uploadsEnabled();

  // Tope de barberos del plan contratado (durante la prueba no hay tope).
  const access = await getAccess(businessId);
  const atLimit = access.barberLimit !== null && barbers.filter((x) => x.active).length >= access.barberLimit;

  // Turnos futuros confirmados por barbero: el modal de eliminación los muestra y exige confirmarlos.
  const future = await prisma.appointment.groupBy({
    by: ["barberId"],
    where: { businessId, status: "CONFIRMED", startAt: { gt: new Date() } },
    _count: { _all: true },
  });
  const futureCount = new Map(future.map((f) => [f.barberId, f._count._all]));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Barberos</h1>
      <p className="text-sm opacity-70">La foto y la descripción se muestran en tu página de reservas para que el cliente elija.</p>

      <div className="card space-y-3">
        <h2 className="font-semibold">Nuevo barbero</h2>
        {atLimit && (
          <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            Tu plan permite hasta {access.barberLimit} {access.barberLimit === 1 ? "barbero" : "barberos"} y ya llegaste al tope.{" "}
            <Link href="/admin/billing" className="font-semibold underline">
              Cambiar de plan
            </Link>
          </p>
        )}
        <fieldset disabled={atLimit} className="m-0 min-w-0 border-0 p-0">
          <BarberForm enabled={enabled} />
        </fieldset>
      </div>

      {barbers.map((b) => (
        <div key={b.id} className={`card ${b.active ? "" : "opacity-60"}`}>
          <BarberForm b={b} enabled={enabled} />
          <div className="mt-3 border-t border-neutral-100 pt-3">
            <DeleteBarberButton id={b.id} name={b.name} futureCount={futureCount.get(b.id) ?? 0} />
          </div>
        </div>
      ))}
    </div>
  );
}
