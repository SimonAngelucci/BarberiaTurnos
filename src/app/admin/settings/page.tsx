import { requireAdmin } from "@/lib/auth";
import { getBusiness } from "@/lib/db";
import { saveSettings } from "../actions";

export default async function SettingsPage() {
  await requireAdmin();
  const b = await getBusiness();

  return (
    <form action={saveSettings} className="space-y-4">
      <h1 className="text-xl font-bold">Configuración del negocio</h1>

      <section className="card grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Nombre</label>
          <input name="name" required className="input" defaultValue={b.name} />
        </div>
        <div>
          <label className="label">Frase</label>
          <input name="tagline" className="input" defaultValue={b.tagline} />
        </div>
        <div>
          <label className="label">Logo / favicon (URL)</label>
          <input name="logoUrl" className="input" placeholder="https://…" defaultValue={b.logoUrl ?? ""} />
        </div>
        <div>
          <label className="label">Color principal</label>
          <input name="primaryColor" type="color" className="h-11 w-full rounded-xl border border-neutral-300" defaultValue={b.primaryColor} />
        </div>
      </section>

      <section className="card grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label">Zona horaria (IANA)</label>
          <input name="timezone" required className="input" defaultValue={b.timezone} />
        </div>
        <div>
          <label className="label">Moneda (ISO)</label>
          <input name="currency" required maxLength={3} className="input uppercase" defaultValue={b.currency} />
        </div>
        <div>
          <label className="label">Intervalo de turnos (min)</label>
          <input name="slotIntervalMin" type="number" min={5} step={5} required className="input" defaultValue={b.slotIntervalMin} />
        </div>
        <div>
          <label className="label">Aviso mínimo (min)</label>
          <input name="minNoticeMin" type="number" min={0} required className="input" defaultValue={b.minNoticeMin} />
        </div>
        <div>
          <label className="label">Reservas hasta (días)</label>
          <input name="maxAdvanceDays" type="number" min={1} required className="input" defaultValue={b.maxAdvanceDays} />
        </div>
        <div>
          <label className="label">Recordatorios (min antes, separados por coma)</label>
          <input name="reminders" className="input" defaultValue={b.reminderOffsetsMin.join(", ")} />
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Mensajes de WhatsApp</h2>
        <p className="text-xs text-neutral-500">Variables: {"{{nombre}} {{servicio}} {{fecha}} {{hora}} {{negocio}}"}</p>
        <div>
          <label className="label">Confirmación</label>
          <textarea name="confirmTemplate" rows={3} className="input" defaultValue={b.confirmTemplate} />
        </div>
        <div>
          <label className="label">Recordatorio</label>
          <textarea name="reminderTemplate" rows={3} className="input" defaultValue={b.reminderTemplate} />
        </div>
        <div>
          <label className="label">Cancelación</label>
          <textarea name="cancelTemplate" rows={3} className="input" defaultValue={b.cancelTemplate} />
        </div>
      </section>

      <button className="btn">Guardar cambios</button>
    </form>
  );
}
