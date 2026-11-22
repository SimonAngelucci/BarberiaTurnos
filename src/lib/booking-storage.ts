/**
 * Borrador de la reserva en el navegador (localStorage), una clave por negocio: `dameunturno:booking:<slug>`.
 * Guarda lo elegido (servicio, profesional, día, horario, forma de pago) y los datos ya escritos del formulario (nombre, apellido
 * y WhatsApp). Nunca se guardan datos de pago. Se descarta pasadas BOOKING_TTL_MS horas, y se borra al confirmar la reserva.
 * Todos los accesos van en try/catch: en modo privado o con el storage bloqueado simplemente no se guarda nada.
 */
export const BOOKING_TTL_MS = 12 * 60 * 60 * 1000;
const VERSION = 1;

export type BookingDraft = {
  v: number;
  savedAt: number;
  serviceId: string | null;
  barberId: string | null;
  /** Día elegido, YYYY-MM-DD. */
  date: string | null;
  /** Horario elegido (ISO UTC). */
  slot: string | null;
  payment: string | null;
  form: { firstName: string; lastName: string; phone: string };
};

export const bookingKey = (slug: string) => `dameunturno:booking:${slug}`;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const strOrNull = (v: unknown, max: number) => (typeof v === "string" && v ? v.slice(0, max) : null);

/** Valida y limpia lo leído del storage (puede estar roto o haber sido tocado). null = descartar. */
export function parseDraft(raw: string | null, now = Date.now()): BookingDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Record<string, unknown>;
    if (!d || typeof d !== "object" || d.v !== VERSION || typeof d.savedAt !== "number") return null;
    if (now - d.savedAt > BOOKING_TTL_MS || d.savedAt > now + 60_000) return null; // vencido (o con fecha del futuro)
    const f = (d.form ?? {}) as Record<string, unknown>;
    const slot = strOrNull(d.slot, 40);
    return {
      v: VERSION,
      savedAt: d.savedAt,
      serviceId: strOrNull(d.serviceId, 60),
      barberId: strOrNull(d.barberId, 60),
      date: typeof d.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date : null,
      // Un horario que ya pasó no se restaura.
      slot: slot && new Date(slot).getTime() > now ? slot : null,
      payment: strOrNull(d.payment, 12),
      form: { firstName: str(f.firstName, 60), lastName: str(f.lastName, 60), phone: str(f.phone, 25) },
    };
  } catch {
    return null;
  }
}

export function loadDraft(slug: string): BookingDraft | null {
  try {
    const key = bookingKey(slug);
    const raw = localStorage.getItem(key);
    const draft = parseDraft(raw);
    if (raw && !draft) localStorage.removeItem(key); // vencido o inválido: se limpia
    return draft;
  } catch {
    return null;
  }
}

export function saveDraft(slug: string, draft: Omit<BookingDraft, "v" | "savedAt">) {
  try {
    localStorage.setItem(bookingKey(slug), JSON.stringify({ ...draft, v: VERSION, savedAt: Date.now() }));
  } catch {
    /* storage lleno o bloqueado: la reserva sigue funcionando, solo no se recuerda */
  }
}

export function clearDraft(slug: string) {
  try {
    localStorage.removeItem(bookingKey(slug));
  } catch {
    /* nada que limpiar */
  }
}

/** ¿Tiene sentido guardar? Un borrador vacío (solo el prefijo +54) no se guarda. */
export function isMeaningful(d: Omit<BookingDraft, "v" | "savedAt">, defaultPrefix: string) {
  const phone = d.form.phone.trim() === defaultPrefix.trim() ? "" : d.form.phone.trim();
  return !!(d.barberId || d.date || d.slot || d.form.firstName.trim() || d.form.lastName.trim() || phone);
}
