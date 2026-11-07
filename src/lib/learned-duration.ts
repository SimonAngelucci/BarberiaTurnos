import { prisma } from "./db";

/** Respuestas necesarias antes de usar el tiempo aprendido (con menos, se usa la duración normal del servicio). */
export const MIN_SAMPLES = 3;
/** Se miran las últimas N respuestas: el tiempo de un cliente cambia con los años (pelo más corto, más largo…). */
export const WINDOW = 5;

export type Learned = {
  minutes: number;
  /** standard = duración normal del servicio; learned = promedio confiable del cliente; override = fijado por el administrador. */
  source: "standard" | "learned" | "override";
  /** Cuántas respuestas se tuvieron en cuenta. */
  samples: number;
};

/**
 * Tiempo a reservar para un cliente. Pura (sin base de datos) para poder probarla sola.
 *
 * Para no volverse loco con pocos datos o con un dato raro:
 * - hace falta un mínimo de respuestas (MIN_SAMPLES) y se usan solo las últimas (WINDOW);
 * - cada respuesta se limita a entre 50 % y 200 % de la duración normal (un «5 minutos» o un «3 horas» por error no arrastra);
 * - se toma la MEDIANA, que ignora un valor aislado, y se redondea a múltiplos de 5 min.
 */
export function learnedMinutes(p: { samples: number[]; standardMin: number; overrideMin?: number | null }): Learned {
  if (p.overrideMin && p.overrideMin > 0) return { minutes: p.overrideMin, source: "override", samples: p.samples.length };
  const recent = p.samples.slice(0, WINDOW);
  if (recent.length < MIN_SAMPLES) return { minutes: p.standardMin, source: "standard", samples: recent.length };

  const lo = Math.max(5, Math.round(p.standardMin * 0.5));
  const hi = Math.round(p.standardMin * 2);
  const sorted = recent.map((m) => Math.min(hi, Math.max(lo, m))).sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const minutes = Math.min(480, Math.max(5, Math.round(median / 5) * 5));
  return { minutes, source: "learned", samples: recent.length };
}

/** Respuestas (más nuevas primero) de un cliente para un servicio, sin contar las anteriores a un reseteo. */
export async function sampleMinutes(customerId: string, serviceId: string, resetAt: Date | null): Promise<number[]> {
  const rows = await prisma.appointment.findMany({
    where: {
      customerId,
      serviceId,
      actualDurationMin: { not: null },
      status: { in: ["CONFIRMED", "COMPLETED"] },
      ...(resetAt ? { startAt: { gt: resetAt } } : {}),
    },
    orderBy: { startAt: "desc" },
    take: WINDOW,
    select: { actualDurationMin: true },
  });
  return rows.map((r) => r.actualDurationMin!);
}

/**
 * Duración efectiva de un servicio para un cliente identificado por su WhatsApp (E.164).
 * Sin función activada, sin teléfono o con un cliente nuevo: la duración normal del servicio.
 */
export async function effectiveDuration(p: { businessId: string; serviceId: string; standardMin: number; phone?: string | null; learn: boolean }): Promise<Learned> {
  const standard: Learned = { minutes: p.standardMin, source: "standard", samples: 0 };
  if (!p.learn || !p.phone) return standard;
  const customer = await prisma.customer.findUnique({
    where: { businessId_phone: { businessId: p.businessId, phone: p.phone } },
    select: { id: true, times: { where: { serviceId: p.serviceId }, select: { overrideMin: true, resetAt: true } } },
  });
  if (!customer) return standard;
  const adj = customer.times[0];
  const samples = await sampleMinutes(customer.id, p.serviceId, adj?.resetAt ?? null);
  return learnedMinutes({ samples, standardMin: p.standardMin, overrideMin: adj?.overrideMin });
}
