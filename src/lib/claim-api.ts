import { NextResponse } from "next/server";
import { z } from "zod";
import { getBusinessBySlug, prisma } from "./db";
import { changePolicy, normalizeClaimCode, type PolicyResult } from "./claim";
import { blocked, clientIp, recordFailure } from "./rate-limit";

export const claimBody = z.object({ slug: z.string().min(1).max(60), code: z.string().min(1).max(40) });

const WINDOW = 10 * 60_000;
const MAX_FAILS = 8;
export const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/**
 * Busca el turno por (barbería de la página, código). Un código de otra barbería no sirve.
 * Mismo mensaje para "formato inválido" y "no existe" (no revela nada), y se limitan los intentos fallidos por IP.
 */
export async function findByClaim(req: Request, slug: string, rawCode: string) {
  const key = `claim:${clientIp(req)}`;
  if (blocked(key, MAX_FAILS, WINDOW)) return { response: fail("Demasiados intentos. Esperá unos minutos y volvé a probar.", 429) };

  const business = await getBusinessBySlug(slug);
  const code = normalizeClaimCode(rawCode);
  const appt =
    business && code
      ? await prisma.appointment.findFirst({
          where: { businessId: business.id, claimCode: code },
          include: { service: true, barber: true, customer: true },
        })
      : null;
  if (!business || !appt) {
    recordFailure(key, WINDOW);
    return { response: fail("No encontramos un turno con ese código. Revisá que esté bien escrito.", 404) };
  }
  return { business, appt, code: code! };
}

/** Corta con el mensaje del plazo/estado si el turno no se puede modificar ahora. */
export function ensureChangeable(business: Parameters<typeof changePolicy>[0], appt: Parameters<typeof changePolicy>[1]): { response: NextResponse } | { policy: Extract<PolicyResult, { ok: true }> } {
  const policy = changePolicy(business, appt);
  return policy.ok ? { policy } : { response: fail(policy.error, policy.status) };
}
