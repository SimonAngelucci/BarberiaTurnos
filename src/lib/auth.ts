import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, SESSION_MAX_AGE, signToken, verifyToken, type Session } from "@/lib/session-token";

export { SESSION_COOKIE, verifyToken };
export type { Session };

const TOUCH_EVERY_MS = 5 * 60_000;

async function setCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

/** Registra la sesión (dispositivo, navegador, IP) y deja la cookie. Devuelve el id de la sesión. */
export async function createSession(s: { adminId: string; businessId: string }) {
  const h = await headers();
  const row = await prisma.adminSession.create({
    data: {
      adminId: s.adminId,
      userAgent: h.get("user-agent")?.slice(0, 300) || null,
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) || null,
    },
    select: { id: true },
  });
  await setCookie(await signToken({ ...s, sid: row.id }));
  return row.id;
}

/**
 * Sesión actual, ya comprobada contra la base: si se cerró desde otro dispositivo (o con «cerrar todas»), deja de valer.
 * Una consulta por pedido (cache) y la fecha de «último acceso» se actualiza cada pocos minutos.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const s = await verifyToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!s) return null;

  if (s.sid) {
    const row = await prisma.adminSession.findUnique({ where: { id: s.sid }, select: { adminId: true, revokedAt: true, lastSeenAt: true } });
    if (!row || row.revokedAt || row.adminId !== s.adminId) return null;
    if (Date.now() - row.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
      await prisma.adminSession.update({ where: { id: s.sid }, data: { lastSeenAt: new Date() } }).catch(() => {});
    }
    return s;
  }

  // Token de antes de las sesiones listables: vale mientras no se hayan «cerrado todas» después de emitirlo.
  const admin = await prisma.adminUser.findUnique({ where: { id: s.adminId }, select: { businessId: true, tokensValidAfter: true } });
  if (!admin || admin.businessId !== s.businessId) return null;
  if (admin.tokensValidAfter && (s.iat ?? 0) * 1000 < admin.tokensValidAfter.getTime()) return null;
  return s;
});

/** Usar al inicio de CADA página y server action admin (el middleware no basta para actions). */
export async function requireAdmin() {
  const s = await getSession();
  if (!s) redirect("/admin/login");
  return s;
}

/** Cierra solo la sesión de este dispositivo (la marca como revocada y borra la cookie). */
export async function endCurrentSession() {
  const jar = await cookies();
  const s = await verifyToken(jar.get(SESSION_COOKIE)?.value);
  if (s?.sid) await prisma.adminSession.updateMany({ where: { id: s.sid, adminId: s.adminId, revokedAt: null }, data: { revokedAt: new Date() } }).catch(() => {});
  jar.delete(SESSION_COOKIE);
}

/** Si la sesión actual es de las antiguas (sin id), le crea su registro y reemite la cookie, para poder distinguirla de las demás. */
export async function ensureCurrentSessionRow(s: Session): Promise<string> {
  if (s.sid) return s.sid;
  return createSession({ adminId: s.adminId, businessId: s.businessId });
}
