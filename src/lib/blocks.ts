import { DateTime } from "luxon";

// Bloqueos de horarios: lógica pura (sin base de datos) para poder probarla. Un bloqueo es un rango [inicio, fin) que oculta los
// horarios cuyo inicio cae adentro; NO borra nada de la configuración semanal. Todo se calcula en la zona horaria del negocio.

export type BlockSpec = {
  /** Profesional (id) o null = todo el negocio. */
  barberId: string | null;
  /** Primer día, "yyyy-MM-dd". */
  dateFrom: string;
  /** Último día (opcional): varios días seguidos. */
  dateTo?: string | null;
  allDay: boolean;
  /** "HH:mm". Sin timeTo (y sin allDay) = un horario puntual. */
  timeFrom?: string | null;
  timeTo?: string | null;
  /** Repetir cada semana hasta esta fecha (solo con un único día). */
  repeatUntil?: string | null;
};

export type Interval = { startAt: Date; endAt: Date };

export const MAX_OCCURRENCES = 120;
export const MAX_SPAN_DAYS = 366;
const SLOT_MS = 60_000; // un horario puntual se guarda como un rango de 1 minuto: oculta ese inicio y ningún otro

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function at(date: string, time: string, tz: string) {
  const d = DateTime.fromISO(`${date}T${time}`, { zone: tz });
  if (!d.isValid) throw new Error("Fecha u hora inválida");
  return d;
}
const day0 = (date: string, tz: string) => {
  const d = DateTime.fromISO(date, { zone: tz }).startOf("day");
  if (!d.isValid) throw new Error("Fecha inválida");
  return d;
};

/** Convierte lo que cargó el administrador en los rangos concretos a guardar. Lanza un Error con mensaje claro si algo no cierra. */
export function expandBlock(spec: BlockSpec, tz: string, now: DateTime = DateTime.now()): Interval[] {
  if (!ISO.test(spec.dateFrom)) throw new Error("Elegí la fecha");
  const dateTo = spec.dateTo && spec.dateTo !== spec.dateFrom ? spec.dateTo : null;
  if (dateTo && !ISO.test(dateTo)) throw new Error("Fecha inválida");
  if (dateTo && dateTo < spec.dateFrom) throw new Error("La fecha final es anterior a la inicial");
  if (dateTo && diffDays(spec.dateFrom, dateTo) > MAX_SPAN_DAYS) throw new Error("El bloqueo es demasiado largo");
  const repeat = spec.repeatUntil || null;
  if (repeat) {
    if (dateTo) throw new Error("La repetición semanal es para un solo día");
    if (!ISO.test(repeat) || repeat < spec.dateFrom) throw new Error("La repetición tiene que terminar después del primer día");
  }

  let hours: { from: string; to: string | null } | null = null;
  if (!spec.allDay) {
    if (!spec.timeFrom || !HHMM.test(spec.timeFrom)) throw new Error("Elegí la hora");
    if (spec.timeTo && !HHMM.test(spec.timeTo)) throw new Error("Hora inválida");
    if (spec.timeTo && spec.timeTo <= spec.timeFrom) throw new Error("La hora final tiene que ser posterior a la inicial");
    hours = { from: spec.timeFrom, to: spec.timeTo || null };
  }

  const out: Interval[] = [];
  const one = (date: string, endDate?: string) => {
    if (!hours) {
      const s = day0(date, tz);
      out.push({ startAt: s.toJSDate(), endAt: day0(endDate ?? date, tz).plus({ days: 1 }).toJSDate() });
    } else {
      const s = at(date, hours.from, tz);
      out.push({ startAt: s.toJSDate(), endAt: hours.to ? at(date, hours.to, tz).toJSDate() : new Date(s.toMillis() + SLOT_MS) });
    }
  };

  if (repeat) {
    for (let d = DateTime.fromISO(spec.dateFrom, { zone: "utc" }); (d.toISODate() as string) <= repeat; d = d.plus({ weeks: 1 })) {
      if (out.length >= MAX_OCCURRENCES) throw new Error(`La repetición no puede pasar de ${MAX_OCCURRENCES} semanas`);
      one(d.toISODate() as string);
    }
  } else if (dateTo && !hours) {
    one(spec.dateFrom, dateTo); // varios días seguidos, de corrido: un solo rango
  } else if (dateTo) {
    for (let d = DateTime.fromISO(spec.dateFrom, { zone: "utc" }); (d.toISODate() as string) <= dateTo; d = d.plus({ days: 1 })) one(d.toISODate() as string);
  } else {
    one(spec.dateFrom);
  }

  const future = out.filter((i) => i.endAt.getTime() > now.toMillis());
  if (future.length === 0) throw new Error("Ese horario ya pasó");
  return future;
}

/** b − a en días (fechas "yyyy-MM-dd"). */
function diffDays(a: string, b: string) {
  return Math.round(DateTime.fromISO(b, { zone: "utc" }).diff(DateTime.fromISO(a, { zone: "utc" }), "days").days);
}

export type BlockKind = "slot" | "allday" | "range";

/** Cómo mostrar un bloqueo: un horario, uno o varios días completos, o un rango de horas. */
export function blockKind(startAt: Date, endAt: Date, tz: string): BlockKind {
  if (endAt.getTime() - startAt.getTime() <= SLOT_MS) return "slot";
  const s = DateTime.fromJSDate(startAt).setZone(tz);
  const e = DateTime.fromJSDate(endAt).setZone(tz);
  return s.equals(s.startOf("day")) && e.equals(e.startOf("day")) ? "allday" : "range";
}

/** Texto corto: «16:30», «13:00 a 15:00», «Todo el día», «Del 22/12 al 26/12». Sin la fecha (la muestra quien lo usa). */
export function blockLabel(startAt: Date, endAt: Date, tz: string): string {
  const k = blockKind(startAt, endAt, tz);
  const s = DateTime.fromJSDate(startAt).setZone(tz);
  const e = DateTime.fromJSDate(endAt).setZone(tz);
  if (k === "slot") return s.toFormat("HH:mm");
  if (k === "range") return `${s.toFormat("HH:mm")} a ${e.toFormat("HH:mm")}`;
  const last = e.minus({ days: 1 });
  return last.hasSame(s, "day") ? "Todo el día" : `Del ${s.toFormat("dd/MM")} al ${last.toFormat("dd/MM")}`;
}

export type BlockRow = { id: string; barberId: string | null; startAt: Date; endAt: Date; reason: string | null; groupId: string | null };
export type BlockCard = BlockRow & { count: number; pattern: "single" | "weekly" | "daily"; lastStart: Date; lastEnd: Date };

/** Junta las ocurrencias de una misma repetición en una sola tarjeta (la primera que viene) y ordena por fecha. */
export function groupBlocks(rows: BlockRow[]): BlockCard[] {
  const byGroup = new Map<string, BlockRow[]>();
  const singles: BlockRow[] = [];
  for (const r of rows) {
    if (r.groupId) byGroup.set(r.groupId, [...(byGroup.get(r.groupId) ?? []), r]);
    else singles.push(r);
  }
  const cards: BlockCard[] = singles.map((r) => ({ ...r, count: 1, pattern: "single", lastStart: r.startAt, lastEnd: r.endAt }));
  for (const list of byGroup.values()) {
    const s = [...list].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
    const gapDays = s.length > 1 ? (s[1].startAt.getTime() - s[0].startAt.getTime()) / 86_400_000 : 0;
    const last = s[s.length - 1];
    cards.push({ ...s[0], count: s.length, pattern: s.length === 1 ? "single" : gapDays > 6 ? "weekly" : "daily", lastStart: last.startAt, lastEnd: last.endAt });
  }
  return cards.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

/** Valores del formulario para editar un bloqueo existente (o toda su serie). */
export function blockFormValues(c: BlockCard, tz: string) {
  const s = DateTime.fromJSDate(c.startAt).setZone(tz);
  const k = blockKind(c.startAt, c.endAt, tz);
  const e = DateTime.fromJSDate(c.endAt).setZone(tz);
  const lastDay = DateTime.fromJSDate(c.lastStart).setZone(tz).toISODate()!;
  const base = { barberId: c.barberId, reason: c.reason ?? "", allDay: k === "allday", timeFrom: k === "allday" ? "" : s.toFormat("HH:mm"), timeTo: k === "range" ? e.toFormat("HH:mm") : "" };
  if (c.pattern === "weekly") return { ...base, dateFrom: s.toISODate()!, dateTo: "", repeatUntil: lastDay };
  if (c.pattern === "daily") return { ...base, dateFrom: s.toISODate()!, dateTo: lastDay, repeatUntil: "" };
  // Un solo bloqueo (puede ser de varios días corridos: el último día es el anterior al fin exclusivo).
  const lastDayOfRange = k === "allday" ? e.minus({ days: 1 }).toISODate()! : s.toISODate()!;
  return { ...base, dateFrom: s.toISODate()!, dateTo: lastDayOfRange !== s.toISODate() ? lastDayOfRange : "", repeatUntil: "" };
}

export type ApptLite ={ id: string; barberId: string | null; startAt: Date };

/** Turnos que ya están reservados dentro de lo que se quiere bloquear (de ese profesional, o de cualquiera si es todo el negocio). */
export function findConflicts<A extends ApptLite>(appts: A[], intervals: Interval[], barberId: string | null): A[] {
  return appts.filter((a) => (barberId === null || a.barberId === barberId) && intervals.some((i) => a.startAt.getTime() >= i.startAt.getTime() && a.startAt.getTime() < i.endAt.getTime()));
}
