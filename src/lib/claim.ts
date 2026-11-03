import { randomInt } from "node:crypto";
import { DateTime } from "luxon";
import { noticePhrase } from "./format";

// Alfabeto de 31 caracteres sin los que se confunden (0/O, 1/I/L): REC- + 6 → ~887 millones de combinaciones.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const BODY_LEN = 6;

/** Código de reclamo con aleatoriedad criptográfica (ej. REC-8F3K9A). La unicidad la garantiza la base. */
export function generateClaimCode() {
  let s = "";
  for (let i = 0; i < BODY_LEN; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `REC-${s}`;
}

/** Acepta mayúsculas/minúsculas, espacios, guiones y con o sin «REC». Devuelve null si no es un código posible. */
export function normalizeClaimCode(input: string): string | null {
  const t = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = t.length === BODY_LEN ? t : t.startsWith("REC") && t.length === BODY_LEN + 3 ? t.slice(3) : null;
  if (!body || [...body].some((c) => !ALPHABET.includes(c))) return null;
  return `REC-${body}`;
}

type PolicyBusiness = { allowClientChanges: boolean; changeMinNoticeMin: number; timezone: string };
type PolicyAppt = { status: string; startAt: Date };
export type PolicyResult = { ok: true; deadline: Date } | { ok: false; status: number; error: string };

/**
 * ¿Puede el cliente reprogramar/cancelar ahora? Se evalúa SIEMPRE en el servidor.
 * El plazo es "hasta N antes del turno", configurable por barbería.
 */
export function changePolicy(b: PolicyBusiness, a: PolicyAppt, now = new Date()): PolicyResult {
  if (!b.allowClientChanges) {
    return { ok: false, status: 403, error: "Esta barbería no permite reprogramar o cancelar por acá. Comunicate con ella directamente." };
  }
  if (a.status === "CANCELLED") return { ok: false, status: 409, error: "Este turno ya fue cancelado." };
  if (a.status === "COMPLETED" || a.status === "NO_SHOW") return { ok: false, status: 409, error: "Este turno ya pasó." };
  if (a.status !== "CONFIRMED") return { ok: false, status: 409, error: "Este turno todavía no está confirmado (falta completar el pago)." };

  const deadline = new Date(a.startAt.getTime() - b.changeMinNoticeMin * 60_000);
  if (now.getTime() > deadline.getTime()) {
    const when = DateTime.fromJSDate(deadline).setZone(b.timezone).setLocale("es").toFormat("cccc d 'de' LLLL 'a las' HH:mm");
    return {
      ok: false,
      status: 403,
      error:
        b.changeMinNoticeMin <= 0
          ? "El turno ya comenzó, no se puede modificar."
          : `Ya no se puede reprogramar ni cancelar este turno: el plazo es ${noticePhrase(b.changeMinNoticeMin)} (venció el ${when}). Comunicate con la barbería.`,
    };
  }
  return { ok: true, deadline };
}
