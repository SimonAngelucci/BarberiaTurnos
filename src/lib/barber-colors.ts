/** Colores de los profesionales: el mismo en la agenda, los turnos y el resto del panel. */
export const BARBER_PALETTE = ["#f2994a", "#2d9cdb", "#bb6bd9", "#27ae60", "#eb5757", "#00a8a8", "#e0a800", "#7a8cff"] as const;

const HEX = /^#[0-9a-fA-F]{6}$/;
export const isBarberColor = (c: unknown): c is string => typeof c === "string" && HEX.test(c);

/**
 * Color de cada profesional: el elegido a mano o, si no tiene, uno de la paleta según su orden de alta (el id de cuid crece
 * con el tiempo), sin repetir mientras haya colores libres. Así es estable aunque cambie el orden en pantalla.
 */
export function barberColors(barbers: { id: string; color: string | null }[]): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Set(barbers.filter((b) => isBarberColor(b.color)).map((b) => b.color!.toLowerCase()));
  const free = BARBER_PALETTE.filter((c) => !used.has(c));
  let i = 0;
  for (const b of [...barbers].sort((x, y) => (x.id < y.id ? -1 : 1))) {
    if (isBarberColor(b.color)) out.set(b.id, b.color);
    else out.set(b.id, free.length ? free[i++ % free.length] : BARBER_PALETTE[i++ % BARBER_PALETTE.length]);
  }
  return out;
}
