type C = {
  code?: string;
  name: string;
  email: string | null;
  benefitType: "TRACKING" | "COMMISSION" | "FREE_MONTHS";
  commissionPercent: number;
  commissionMonths: number | null;
  freeMonths: number;
  notes: string | null;
};

/** Campos del formulario de creadores (alta y edición). El código solo se puede escribir al crear. */
export function CreatorFields({ c, creating }: { c?: C; creating?: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-6">
      {creating && (
        <div className="sm:col-span-2">
          <label className="label">Código</label>
          <input name="code" required maxLength={20} className="input font-mono uppercase" placeholder="JUAN20" autoComplete="off" />
          <p className="mt-1 text-xs text-neutral-500">No se puede cambiar después.</p>
        </div>
      )}
      <div className={creating ? "sm:col-span-2" : "sm:col-span-3"}>
        <label className="label">Nombre del creador</label>
        <input name="name" required maxLength={60} className="input" defaultValue={c?.name} />
      </div>
      <div className={creating ? "sm:col-span-2" : "sm:col-span-3"}>
        <label className="label">Email (opcional)</label>
        <input name="email" type="email" className="input" defaultValue={c?.email ?? ""} />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Beneficio</label>
        <select name="benefitType" className="input" defaultValue={c?.benefitType ?? "TRACKING"}>
          <option value="TRACKING">Solo seguimiento (sin pago)</option>
          <option value="COMMISSION">Comisión por cada cobro</option>
          <option value="FREE_MONTHS">Meses gratis por barbería que paga</option>
        </select>
      </div>
      <div>
        <label className="label">Comisión %</label>
        <input name="commissionPercent" type="number" min={0} max={100} className="input" defaultValue={c?.commissionPercent ?? 0} />
      </div>
      <div>
        <label className="label">Durante (meses)</label>
        <input name="commissionMonths" type="number" min={1} max={120} className="input" defaultValue={c?.commissionMonths ?? ""} placeholder="Siempre" />
      </div>
      <div>
        <label className="label">Meses gratis</label>
        <input name="freeMonths" type="number" min={0} max={24} className="input" defaultValue={c?.freeMonths ?? 0} />
      </div>
      <div className="sm:col-span-6">
        <label className="label">Notas internas</label>
        <textarea name="notes" rows={2} maxLength={500} className="input" defaultValue={c?.notes ?? ""} />
      </div>
    </div>
  );
}
