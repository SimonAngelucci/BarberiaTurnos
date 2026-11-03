// Limitador de intentos fallidos en memoria (por instancia del servidor). Es una barrera de mejor esfuerzo contra
// quien prueba códigos al azar; la defensa de fondo es el tamaño del código (~887 millones de combinaciones).
const buckets = new Map<string, number[]>();

const recent = (key: string, windowMs: number) => {
  const now = Date.now();
  const list = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length) buckets.set(key, list);
  else buckets.delete(key);
  return list;
};

/** ¿Ya hubo demasiados fallos recientes con esta clave? */
export const blocked = (key: string, limit: number, windowMs: number) => recent(key, windowMs).length >= limit;

export function recordFailure(key: string, windowMs: number) {
  const list = recent(key, windowMs);
  list.push(Date.now());
  buckets.set(key, list);
  if (buckets.size > 5000) for (const k of buckets.keys()) if (recent(k, windowMs).length === 0) buckets.delete(k); // limpieza
}

/** IP del cliente detrás del proxy de Vercel. */
export const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
