import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const SESSION_COOKIE = "session";
const MAX_AGE = 60 * 60 * 24 * 7;

function key() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error("AUTH_SECRET no configurado (mín. 16 caracteres)");
  return new TextEncoder().encode(s);
}

export type Session = { adminId: string; businessId: string };

export async function createSession(s: Session) {
  const token = await new SignJWT({ ...s })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(key());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function verifyToken(token?: string): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    // Exige los dos ids: un token firmado por nosotros pero de otro tipo (ej. el del Super Admin) no es una sesión de barbería.
    if (typeof payload.adminId !== "string" || typeof payload.businessId !== "string") return null;
    return { adminId: payload.adminId, businessId: payload.businessId };
  } catch {
    return null;
  }
}

export async function getSession() {
  return verifyToken((await cookies()).get(SESSION_COOKIE)?.value);
}

/** Usar al inicio de CADA página y server action admin (el middleware no basta para actions). */
export async function requireAdmin() {
  const s = await getSession();
  if (!s) redirect("/admin/login");
  return s;
}
