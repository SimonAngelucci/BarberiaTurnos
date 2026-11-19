// Generación de inicios de turno: función pura (sin base de datos), compartida por el servidor y por el editor de horarios
// del panel (que la usa para mostrar al administrador exactamente lo que va a ver el cliente).

export type ScheduleMode = "AUTO" | "MANUAL";
export type Range = readonly [startMs: number, endMs: number];

/**
 * Tramos libres de una franja de atención: lo que queda después de descontar reservas, bloqueos y horarios desactivados.
 * `blocks` puede venir desordenado y con superposiciones.
 */
export function freeGaps(window: Range, blocks: Range[]): Range[] {
  const [ws, we] = window;
  const gaps: Range[] = [];
  let cursor = ws;
  for (const [bs, be] of [...blocks].sort((a, b) => a[0] - b[0])) {
    if (be <= cursor || bs >= we) continue;
    if (bs > cursor) gaps.push([cursor, bs]);
    cursor = Math.max(cursor, be);
  }
  if (cursor < we) gaps.push([cursor, we]);
  return gaps;
}

/**
 * Inicios de turno posibles (ms) dentro de las franjas de atención, sin tocar la base de datos (por eso se puede probar sola).
 *
 * Los dos modos usan la MISMA idea, y solo cambia el paso entre un inicio y el siguiente:
 * - Cada franja de atención se divide en tramos libres (descontando reservas, bloqueos de fechas, descansos y horarios
 *   desactivados). El primer inicio de cada tramo es el comienzo del tramo: la hora de apertura o el momento exacto en que
 *   termina la reserva/bloqueo anterior. Así, si a las 16:00 se reservan 55 min, lo que sigue arranca a las 16:55.
 * - MANUAL: dentro de un tramo, los inicios van cada `intervalMin` minutos.
 * - AUTO: dentro de un tramo, los turnos van uno a continuación del otro según la duración del servicio elegido.
 *
 * En los dos modos el turno completo (inicio + duración real) tiene que entrar en el tramo, es decir antes del cierre y sin
 * pisar nada, y no puede empezar antes de `earliestMs` (aviso mínimo). Con la grilla anclada al tramo, un servicio más largo
 * que el hueco no deja minutos muertos: el resto del día se realinea desde donde termina.
 */
export function generateStarts(p: { mode: ScheduleMode; intervalMin: number; durationMin: number; windows: Range[]; blocks: Range[]; earliestMs: number }): number[] {
  const dur = p.durationMin * 60_000;
  if (!(dur > 0)) return [];
  const step = p.mode === "AUTO" ? dur : p.intervalMin * 60_000;
  if (!(step > 0)) return [];

  const out: number[] = [];
  for (const window of [...p.windows].sort((a, b) => a[0] - b[0])) {
    for (const [gs, ge] of freeGaps(window, p.blocks)) {
      for (let s = gs; s + dur <= ge; s += step) if (s >= p.earliestMs) out.push(s);
    }
  }
  return out;
}
