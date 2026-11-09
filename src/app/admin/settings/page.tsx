import { requireAdmin } from "@/lib/auth";
import { getBusinessById } from "@/lib/db";
import { uploadsEnabled } from "@/lib/upload";
import { ImageField } from "@/components/ImageField";
import { SaveForm } from "@/components/SaveForm";
import { saveSettings } from "../actions";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { businessId } = await requireAdmin();
  const b = await getBusinessById(businessId);
  const sp = await searchParams;

  // Plazos habituales; si el guardado actual no está en la lista (ej. 90 min), se agrega para no perderlo.
  const noticeHours = b.changeMinNoticeMin / 60;
  const noticeOptions = [...new Set([0, 1, 2, 3, 4, 6, 12, 24, 48, 72, 168, noticeHours])].sort((x, y) => x - y);

  return (
    <SaveForm action={saveSettings} className="space-y-4" successText="Cambios guardados ✓">
      <h1 className="text-xl font-bold">Configuración del negocio</h1>

      {sp.welcome && (
        <p className="rounded-xl bg-green-50 p-3 text-sm text-green-800">
          ¡Tu barbería está creada! Tu link de reservas está arriba. Personalizá el nombre, el logo y los colores, y después cargá tus horarios.
        </p>
      )}

      <section className="card grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Nombre</label>
          <input name="name" required className="input" defaultValue={b.name} />
        </div>
        <div>
          <label className="label">Frase</label>
          <input name="tagline" className="input" defaultValue={b.tagline} />
        </div>
        <div className="sm:col-span-2">
          <ImageField name="logoUrl" removeName="removeLogo" kind="logo" label="Logo" currentUrl={b.logoUrl} enabled={uploadsEnabled()} size={80} />
        </div>
      </section>

      <section className="card grid gap-3 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Apariencia</h2>
        <div>
          <label className="label">Color principal (botones y acentos)</label>
          <input name="primaryColor" type="color" className="h-11 w-full rounded-xl border border-neutral-300" defaultValue={b.primaryColor} />
        </div>
        <div>
          <label className="label">Color de fondo de la página</label>
          <input name="bgColor" type="color" className="h-11 w-full rounded-xl border border-neutral-300" defaultValue={b.bgColor} />
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="applyBgToAdmin" defaultChecked={b.applyBgToAdmin} /> Usar también este fondo en el panel de administración
        </label>
        <p className="text-xs text-neutral-500 sm:col-span-2">El texto se ajusta solo (claro u oscuro) según el color de fondo que elijas.</p>
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
        <div>
          <h2 className="font-semibold">Reprogramar y cancelar</h2>
          <p className="text-xs text-neutral-500">
            Al confirmar un turno, el cliente recibe por WhatsApp un código (ej. REC-8F3K9A) para reprogramar o cancelar desde tu página.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="allowClientChanges" defaultChecked={b.allowClientChanges} /> Permitir que los clientes reprogramen o cancelen
        </label>
        <div>
          <label className="label">¿Hasta cuánto tiempo antes del turno pueden hacerlo?</label>
          <select name="changeNoticeHours" className="input" defaultValue={noticeHours}>
            {noticeOptions.map((h) => (
              <option key={h} value={h}>
                {h === 0 ? "Hasta el momento del turno" : h < 24 || h % 24 !== 0 ? `Hasta ${h} ${h === 1 ? "hora" : "horas"} antes` : `Hasta ${h / 24} ${h === 24 ? "día" : "días"} antes`}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-neutral-500">Pasado ese plazo el sistema no deja modificar el turno y le muestra al cliente un mensaje claro.</p>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Mensajes de WhatsApp</h2>
        <p className="text-xs text-neutral-500">Variables: {"{{nombre}} {{servicio}} {{fecha}} {{hora}} {{negocio}} {{codigo}}"}</p>
        <p className="text-xs text-neutral-500">
          El código de reclamo y el plazo se agregan solos al final del mensaje de confirmación (y de pago). Si preferís ubicarlo vos, escribí {"{{codigo}}"} en el texto.
        </p>
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
          <p className="mt-1 text-xs text-neutral-500">Se envía cuando vos cancelás un turno.</p>
        </div>
        <div>
          <label className="label">Turno reprogramado por el cliente</label>
          <textarea name="rescheduleTemplate" rows={3} className="input" defaultValue={b.rescheduleTemplate} />
          <p className="mt-1 text-xs text-neutral-500">También podés usar {"{{fecha_anterior}} y {{hora_anterior}}"}.</p>
        </div>
        <div>
          <label className="label">Turno cancelado por el cliente</label>
          <textarea name="selfCancelTemplate" rows={3} className="input" defaultValue={b.selfCancelTemplate} />
        </div>
      </section>

      <button className="btn">Guardar cambios</button>
    </SaveForm>
  );
}
