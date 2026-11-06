import { SignJWT, jwtVerify } from "jose";

// Parte de la sesión que no toca la base de datos (la usa también el middleware, que corre en el edge).

export const SESSION_COOKIE = "session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

function key() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error("AUTH_SECRET no configurado (mín. 16 caracteres)");
  return new TextEncoder().encode(s);
}

/** `sid` es el id de la sesión en la base; los tokens anteriores a las sesiones listables no lo tienen. `iat` = emisión (segundos). */
export type Session = { adminId: string; businessId: string; sid?: string; iat?: number };

export async function signToken(s: { adminId: string; businessId: string; sid: string }) {
  return new SignJWT({ ...s })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(key());
}

export async function verifyToken(token?: string): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    // Exige los dos ids: un token firmado por nosotros pero de otro tipo (ej. el del Super Admin) no es una sesión de barbería.
    if (typeof payload.adminId !== "string" || typeof payload.businessId !== "string") return null;
    return {
      adminId: payload.adminId,
      businessId: payload.businessId,
      sid: typeof payload.sid === "string" ? payload.sid : undefined,
      iat: typeof payload.iat === "number" ? payload.iat : undefined,
    };
  } catch {
    return null;
  }
}
