import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// Sesión del Super Admin (dueño de la plataforma). Completamente separada de la de las barberías:
// otra cookie, otro rol dentro del token y una vida más corta.
export const SUPER_COOKIE = "sa_session";
const MAX_AGE = 60 * 60 * 12;

function key() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error("AUTH_SECRET no configurado (mín. 16 caracteres)");
  return new TextEncoder().encode(s);
}

export async function createSuperSession(adminId: string) {
  const token = await new SignJWT({ role: "super", adminId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(key());
  (await cookies()).set(SUPER_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

/** Solo acepta tokens con rol «super» (un token de barbería no sirve acá aunque esté firmado con el mismo secreto). */
export async function verifySuperToken(token?: string): Promise<{ adminId: string } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return payload.role === "super" && typeof payload.adminId === "string" ? { adminId: payload.adminId } : null;
  } catch {
    return null;
  }
}

export async function getSuperSession() {
  return verifySuperToken((await cookies()).get(SUPER_COOKIE)?.value);
}

/** Primera línea de CADA página y server action del Super Admin (el middleware no alcanza para las actions). */
export async function requireSuperAdmin() {
  const s = await getSuperSession();
  if (!s) redirect("/superadmin/login");
  return s;
}
