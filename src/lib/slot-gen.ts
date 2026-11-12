// Generación de inicios de turno: función pura (sin base de datos), compartida por el servidor y por el editor de horarios
// del panel (que la usa para mostrar al administrador exactamente lo que va a ver el cliente).

export type ScheduleMode = "AUTO" | "MANUAL";
export type Range = readonly [startMs: number, endMs: number];

/**
 * Inicios de turno posibles (ms) dentro de las franjas de atención, sin tocar la base de datos (por eso se puede probar sola).
 *
 * - MANUAL: los inicios van cada `intervalMin` desde el comienzo de la franja, sin importar el servicio.
 * - AUTO: los inicios dependen de la duración del servicio. En cada tramo libre de la franja los turnos van uno a continuación
 *   del otro (un servicio de 45 min: 09:00, 09:45, 10:30…) y, si hay una reserva, la grilla sigue desde donde ella termina.
 *
 * En los dos modos el turno completo (inicio + duración real) tiene que entrar en la franja, no puede pisar reservas, bloqueos
 * ni horarios desactivados (`blocks`), y no puede empezar antes de `earliestMs`.
 */
export function generateStarts(p: { mode: ScheduleMode; intervalMin: number; durationMin: number; windows: Range[]; blocks: Range[]; earliestMs: number }): number[] {
  const dur = p.durationMin * 60_000;
  const out: number[] = [];
  if (!(dur > 0)) return out;
  const blocks = [...p.blocks].sort((a, b) => a[0] - b[0]);
  const free = (s: number) => !blocks.some(([bs, be]) => s < be && s + dur > bs);

  for (const [ws, we] of p.windows) {
    if (p.mode === "MANUAL") {
      const step = p.intervalMin * 60_000;
      if (!(step > 0)) continue;
      for (let s = ws; s + dur <= we; s += step) if (s >= p.earliestMs && free(s)) out.push(s);
      continue;
    }

    // AUTO: tramos libres de la franja (descontando reservas, bloqueos y horarios desactivados) y turnos seguidos en cada uno.
    let cursor = ws;
    const gaps: Range[] = [];
    for (const [bs, be] of blocks) {
      if (be <= cursor || bs >= we) continue;
      if (bs > cursor) gaps.push([cursor, bs]);
      cursor = Math.max(cursor, be);
    }
    if (cursor < we) gaps.push([cursor, we]);
    for (const [gs, ge] of gaps) for (let s = gs; s + dur <= ge; s += dur) if (s >= p.earliestMs) out.push(s);
  }
  return out;
}
