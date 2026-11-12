// Grilla de horarios del panel: las celdas que el administrador activa o desactiva. Funciones puras (sin base de datos).

/**
 * Celdas de la grilla: desde `start` (la hora de apertura exacta, sea cual sea) cada `interval` min, mientras la celda empiece
 * antes del cierre (minutos desde las 00:00). Incluye la última aunque no entre completa: si un servicio corto sí entra, ese
 * horario lo ve el cliente y el administrador tiene que poder verlo y desactivarlo.
 */
export function gridCells(startMin: number, endMin: number, interval: number): number[] {
  const out: number[] = [];
  if (!(endMin > startMin) || !(interval >= 5)) return out;
  for (let m = startMin; m < endMin; m += interval) out.push(m);
  return out;
}

/**
 * Al cambiar el intervalo, los horarios desactivados se llevan a la grilla nueva: una celda nueva queda desactivada si
 * cruza alguna franja que estaba desactivada (cada celda vieja cubría [inicio, inicio + intervalo viejo)). Se prefiere
 * bloquear de más a reabrir sin querer un horario que el administrador había cerrado.
 */
export function remapDisabled(p: { startMin: number; endMin: number; oldStarts: number[]; oldInterval: number; newInterval: number }): number[] {
  const { oldStarts, oldInterval, newInterval } = p;
  return gridCells(p.startMin, p.endMin, newInterval).filter((m) => oldStarts.some((c) => c < m + newInterval && c + oldInterval > m));
}

/** Celdas de la grilla que caen dentro de un rango [from, to) en minutos (para activar o desactivar un rango de una vez). */
export function cellsInRange(cells: number[], interval: number, fromMin: number, toMin: number): number[] {
  return cells.filter((m) => m < toMin && m + interval > fromMin);
}
