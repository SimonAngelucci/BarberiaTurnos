import { DateTime } from "luxon";
import { PageHero } from "@/components/ui/PageHero";
import { Icon } from "@/components/ui/Icon";
import { Collapsible } from "@/components/ui/Collapsible";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { SaveForm } from "@/components/SaveForm";
import { EconomiaNav } from "@/components/EconomiaNav";
import { PayRuleFields } from "@/components/PayRuleFields";
import { money } from "@/lib/format";
import { barberColors } from "@/lib/barber-colors";
import { leftText, percentLabel, scheduleLabel } from "@/lib/salary";
import type { BarberSalary } from "@/lib/salary-db";
import { markSalaryPaid, savePayRule, undoSalaryPayment } from "./actions";

const dm = (s: string) => DateTime.fromISO(s, { zone: "utc" }).setLocale("es").toFormat("d/MM");
const longDay = (s: string) => DateTime.fromISO(s, { zone: "utc" }).setLocale("es").toFormat("cccc d/MM");

/** Anillo de avance del período; en el centro, los días que faltan. Usa el color del texto, así se ve en claro y en oscuro. */
function Ring({ progress, label, sub }: { progress: number; label: string; sub: string }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-[76px] w-[76px] shrink-0" role="img" aria-label={`${label} ${sub}`}>
      <svg viewBox="0 0 76 76" className="h-full w-full -rotate-90">
        <circle cx="38" cy="38" r={r} fill="none" strokeWidth="7" stroke="currentColor" opacity="0.14" />
        <circle cx="38" cy="38" r={r} fill="none" strokeWidth="7" strokeLinecap="round" stroke="currentColor" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, Math.max(0, progress)))} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-lg font-semibold tabular-nums">{label}</span>
        <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted">{sub}</span>
      </div>
    </div>
  );
}

/** Pantalla de Sueldos (solo presentación: los datos los arma page.tsx). */
export function SueldosView({ today, list, services, tz, currency: c }: { today: string; list: BarberSalary[]; services: { id: string; name: string }[]; tz: string; currency: string }) {
  const names = new Map(services.map((s) => [s.id, s.name]));
  const colors = barberColors(list.map((x) => x.barber));
  const active = list.filter((x) => x.barber.active || x.rules.length > 0 || x.payments.length > 0);
  const total = active.reduce((s, x) => s + (x.calc?.totalCents ?? 0), 0);
  const configured = active.filter((x) => x.period).length;

  const defaultsOf = (x: BarberSalary) => {
    const r = x.period?.rule;
    return r
      ? { percent: r.percentBp / 100, base: r.baseCents / 100, frequency: r.frequency, payDay: r.payDay, rates: Object.fromEntries(Object.entries(r.serviceRates).map(([k, v]) => [k, v / 100])) }
      : { percent: 50, base: 0, frequency: "WEEKLY" as const, payDay: 6, rates: {} };
  };

  return (
    <div className="space-y-4">
      <PageHero title="Sueldos" back={{ href: "/admin/economia", label: "Volver a Economía" }} subtitle="Lo que le corresponde a cada profesional por los turnos realizados, según su porcentaje.">
        <EconomiaNav active="sueldos" />
        {configured > 0 && (
          <div className="on-hero">
            <SectionLabel as="p" className="!text-on-primary opacity-70">A pagar en este momento</SectionLabel>
            <div className="mt-1 text-4xl font-light tabular-nums tracking-tight">{money(total, c)}</div>
          </div>
        )}
      </PageHero>

      <Collapsible className="card" title="¿Cómo se calcula?" leading={<Icon name="info" size={18} className="text-neutral-500" />} headerClassName="text-sm text-neutral-600">
        <p className="text-sm text-neutral-500">
          Se suma lo cobrado en los turnos realizados de cada profesional (con el descuento ya aplicado) y se le aplica su porcentaje, más el monto fijo si tiene. Cuentan los turnos completados o confirmados cuyo horario ya pasó; los cancelados y los ausentes no. Si cambiás un porcentaje, rige desde el período siguiente: el que está en curso y los ya pagados no se tocan.
        </p>
      </Collapsible>

      {active.length === 0 && <p className="card text-sm text-muted">Todavía no tenés profesionales. Cargalos en la sección Profesionales para configurar sus sueldos.</p>}

      {active.map((x) => {
        const col = colors.get(x.barber.id) ?? "#888888";
        const p = x.period;
        const st = x.state;
        const calc = x.calc;
        const last = x.payments[0];
        return (
          <section key={x.barber.id} className="card space-y-4" aria-label={`Sueldo de ${x.barber.name}`}>
            <div className="flex items-center gap-2">
              <span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ background: col }} />
              <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">{x.barber.name}</h2>
              {p && <span className="shrink-0 text-xs text-muted">{scheduleLabel(p.rule)}</span>}
            </div>

            {!p || !st || !calc ? (
              <>
                <p className="text-sm text-muted">Todavía no tiene un sueldo configurado.</p>
                <Collapsible className="rounded-2xl border border-black/10 p-2.5" title="Configurar sueldo" leading={<Icon name="settings" size={16} />} headerClassName="text-sm">
                  <SaveForm action={savePayRule} className="mt-1 space-y-3" successText="Sueldo configurado">
                    <PayRuleFields barberId={x.barber.id} services={services} defaults={defaultsOf(x)} />
                    <button className="btn">Guardar</button>
                  </SaveForm>
                </Collapsible>
              </>
            ) : (
              <>
                <div className="flex items-center gap-4">
                  <Ring progress={st.progress} label={st.overdue ? "!" : st.daysLeft === 0 ? "Hoy" : String(st.daysLeft)} sub={st.overdue ? "atrasado" : st.daysLeft === 0 ? "se paga" : st.daysLeft === 1 ? "día" : "días"} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                      Período {dm(p.start)} al {dm(p.end)}
                    </p>
                    <p className="mt-1 text-3xl font-light tabular-nums tracking-tight">{money(calc.totalCents, c)}</p>
                    <p className="text-xs text-muted">a pagar</p>
                  </div>
                </div>

                <p
                  className={`rounded-xl px-3 py-2 text-sm font-semibold ${st.soon || st.overdue ? "bg-primary text-on-primary" : "bg-surface-muted"}`}
                  role={st.soon || st.overdue ? "status" : undefined}
                >
                  <Icon name="calendar" size={15} className="mr-1.5 inline -translate-y-px" />
                  {st.overdue ? `Pago atrasado: era el ${longDay(p.end)} · ${leftText(st.daysLeft)}` : `Próximo pago: ${longDay(p.end)} · ${leftText(st.daysLeft)}`}
                </p>

                <dl className="grid grid-cols-3 gap-2 border-t pt-3 text-sm" style={{ borderColor: "color-mix(in srgb, currentColor 12%, transparent)" }}>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Turnos</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums">{calc.count}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Facturado</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums">{money(calc.billedCents, c)}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Porcentaje</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums">
                      {percentLabel(p.rule.percentBp)}
                      {Object.keys(p.rule.serviceRates).length > 0 && <span className="font-normal text-muted"> *</span>}
                    </dd>
                  </div>
                </dl>
                {(p.rule.baseCents > 0 || Object.keys(p.rule.serviceRates).length > 0) && (
                  <p className="-mt-2 text-xs text-muted">
                    {p.rule.baseCents > 0 && <>Comisión {money(calc.commissionCents, c)} + fijo {money(p.rule.baseCents, c)}. </>}
                    {Object.keys(p.rule.serviceRates).length > 0 && <>* Algunos servicios tienen un porcentaje propio.</>}
                  </p>
                )}

                {x.scheduled && (
                  <p className="rounded-xl border border-dashed border-black/20 px-3 py-2 text-xs text-muted">
                    <Icon name="repeat" size={14} className="mr-1 inline -translate-y-px" />
                    Cambio programado desde el {dm(x.scheduled.effectiveFrom)}: {percentLabel(x.scheduled.percentBp)}
                    {x.scheduled.baseCents > 0 ? ` + ${money(x.scheduled.baseCents, c)} fijo` : ""} · {scheduleLabel(x.scheduled)}.
                  </p>
                )}

                <Collapsible className="rounded-2xl border border-black/10 p-2.5" title="Marcar como pagado" leading={<Icon name="check-circle" size={16} />} headerClassName="text-sm">
                  <SaveForm action={markSalaryPaid} className="mt-1 space-y-3" successText="Pago registrado" confirm={st.daysLeft > 0 ? `El período termina el ${dm(p.end)}. Si lo cerrás ahora, los turnos que queden hasta esa fecha no se van a pagar en este período. ¿Cerrarlo igual?` : undefined}>
                    <input type="hidden" name="barberId" value={x.barber.id} />
                    <input type="hidden" name="periodStart" value={p.start} />
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <label className="label">Fecha de pago</label>
                        <input name="paidDate" type="date" required max={today} defaultValue={today} className="input" />
                      </div>
                      <div>
                        <label className="label">Monto pagado</label>
                        <input name="amount" type="number" inputMode="decimal" min={0} step="0.01" required defaultValue={calc.totalCents / 100} className="input" />
                      </div>
                      <div>
                        <label className="label">Medio de pago</label>
                        <select name="method" className="input" defaultValue="Efectivo">
                          <option>Efectivo</option>
                          <option>Transferencia</option>
                          <option>Otro</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="label">Nota (opcional)</label>
                      <input name="note" maxLength={200} className="input" placeholder="Ej: incluye propina" />
                    </div>
                    <button className="btn">Marcar como pagado</button>
                  </SaveForm>
                </Collapsible>

                <Collapsible className="rounded-2xl border border-black/10 p-2.5" title={`Ver turnos (${calc.count})`} leading={<Icon name="scissors" size={16} />} headerClassName="text-sm">
                  {calc.items.length === 0 ? (
                    <p className="text-sm text-muted">Todavía no hay turnos realizados en este período.</p>
                  ) : (
                    <ul className="divide-y divide-neutral-100 text-sm">
                      {calc.items.map((i) => (
                        <li key={i.id} className="flex items-center justify-between gap-3 py-2">
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{names.get(i.serviceId) ?? "Servicio"}</span>
                            <span className="text-xs text-muted">
                              {DateTime.fromJSDate(i.startAt).setZone(tz).setLocale("es").toFormat("ccc d LLL · HH:mm")} · {money(i.priceCents, c)} × {percentLabel(i.rateBp)}
                            </span>
                          </span>
                          <strong className="shrink-0 tabular-nums">{money(i.commissionCents, c)}</strong>
                        </li>
                      ))}
                    </ul>
                  )}
                </Collapsible>

                <Collapsible className="rounded-2xl border border-black/10 p-2.5" title="Cambiar porcentaje o frecuencia" leading={<Icon name="pencil" size={16} />} headerClassName="text-sm">
                  <SaveForm action={savePayRule} className="mt-1 space-y-3" successText={x.payments.length ? "Cambio programado para el período siguiente" : "Sueldo guardado"}>
                    <PayRuleFields barberId={x.barber.id} services={services} defaults={defaultsOf(x)} />
                    <p className="text-xs text-muted">
                      {x.payments.length > 0 ? `El cambio rige desde el período que empieza el ${dm(String(addOne(p.end)))}. Lo ya pagado no se modifica.` : "Como todavía no pagaste ningún período, el cambio rige desde el inicio."}
                    </p>
                    <button className="btn">Guardar cambio</button>
                  </SaveForm>
                </Collapsible>
              </>
            )}

            {x.payments.length > 0 && (
              <Collapsible className="rounded-2xl border border-black/10 p-2.5" title={`Pagos anteriores (${x.payments.length})`} leading={<Icon name="wallet" size={16} />} headerClassName="text-sm">
                <ul className="divide-y divide-neutral-100 text-sm">
                  {x.payments.map((pay) => (
                    <li key={pay.id} className="space-y-1 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium">
                          {dm(pay.periodStart)} al {dm(pay.periodEnd)}
                        </span>
                        <strong className="tabular-nums">{money(pay.paidCents, c)}</strong>
                      </div>
                      <p className="text-xs text-muted">
                        Pagado el {DateTime.fromJSDate(pay.paidAt).setZone(tz).setLocale("es").toFormat("d/MM/yyyy")} · {pay.method} · {pay.turnCount} {pay.turnCount === 1 ? "turno" : "turnos"} · facturado {money(pay.billedCents, c)} · {percentLabel(pay.percentBp)}
                        {pay.baseCents > 0 ? ` + ${money(pay.baseCents, c)} fijo` : ""}
                        {pay.paidCents !== pay.computedCents ? ` · calculado ${money(pay.computedCents, c)}` : ""}
                        {pay.note ? ` · ${pay.note}` : ""}
                      </p>
                      {pay.id === last?.id && (
                        <SaveForm action={undoSalaryPayment} successText="Pago deshecho" confirm="¿Deshacer este pago? El período vuelve a quedar en curso.">
                          <input type="hidden" name="id" value={pay.id} />
                          <button className="text-xs font-semibold underline">Deshacer este pago</button>
                        </SaveForm>
                      )}
                    </li>
                  ))}
                </ul>
              </Collapsible>
            )}
          </section>
        );
      })}
    </div>
  );
}

function addOne(s: string) {
  return DateTime.fromISO(s, { zone: "utc" }).plus({ days: 1 }).toISODate() ?? s;
}
