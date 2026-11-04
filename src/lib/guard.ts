import { requireAdmin } from "./auth";
import { getAccess } from "./billing";

export class ReadOnlyError extends Error {
  constructor() {
    super("Tu cuenta está en modo solo lectura: regularizá tu suscripción para volver a hacer cambios.");
  }
}

/**
 * Para TODA acción que modifica datos. Además de estar logueado, exige que la suscripción esté al día.
 * Es la defensa real: la pantalla también deshabilita los formularios, pero eso es solo cortesía visual.
 */
export async function requireWritable() {
  const session = await requireAdmin();
  if ((await getAccess(session.businessId)).readonly) throw new ReadOnlyError();
  return session;
}
