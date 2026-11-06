"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { endCurrentSession, ensureCurrentSessionRow, requireAdmin } from "@/lib/auth";
import { blocked, recordFailure } from "@/lib/rate-limit";
import { billingConfigured, cancelSubscriptionFor } from "@/lib/mp-subscriptions";
import { deleteImage } from "@/lib/upload";
import type { FormState } from "../actions";

// Ninguna de estas acciones usa requireWritable: tienen que funcionar también con la cuenta en solo lectura (por ejemplo,
// para cambiar la contraseña o darse de baja). Todas parten de la sesión; nunca de un id que mande el navegador.

const fail = (error: string): FormState => ({ ok: false, error });
const done = (message: string): FormState => ({ ok: true, message });
const str = (fd: FormData, k: string, max = 200) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.slice(0, max) : "";
};

const PW_WINDOW = 15 * 60_000;
const PW_LIMIT = 5;

/** Verifica la contraseña actual con límite de intentos (frena a quien tenga la sesión abierta y pruebe contraseñas). */
async function checkPassword(adminId: string, password: string): Promise<string | null> {
  const key = `acct-pw:${adminId}`;
  if (blocked(key, PW_LIMIT, PW_WINDOW)) return "Demasiados intentos fallidos. Esperá unos minutos y volvé a probar.";
  const admin = await prisma.adminUser.findUnique({ where: { id: adminId }, select: { passwordHash: true } });
  const ok = !!admin && !!password && (await bcrypt.compare(password, admin.passwordHash));
  if (!ok) {
    recordFailure(key, PW_WINDOW);
    return "La contraseña actual no es correcta.";
  }
  return null;
}

// ------------------------------------------------------------------------------------------ datos de la cuenta

export async function saveAccount(_p: FormState, fd: FormData): Promise<FormState> {
  const s = await requireAdmin();
  const name = str(fd, "name", 120).replace(/\s+/g, " ").trim();
  if (name.length > 80) return fail("El nombre es muy largo (máximo 80 caracteres).");
  const email = str(fd, "email", 200).trim().toLowerCase();
  if (!z.string().email().safeParse(email).success) return fail("Ingresá un email válido.");

  const admin = await prisma.adminUser.findUnique({ where: { id: s.adminId }, select: { email: true } });
  if (!admin) return fail("No encontramos tu cuenta.");

  const emailChanged = email !== admin.email;
  if (emailChanged) {
    // El email es lo que se usa para ingresar: cambiarlo exige confirmar con la contraseña.
    const bad = await checkPassword(s.adminId, str(fd, "currentPassword", 100));
    if (bad) return fail(emailChanged ? `Para cambiar el email confirmá tu contraseña. ${bad}` : bad);
    const taken = await prisma.adminUser.findUnique({ where: { email }, select: { id: true } });
    if (taken) return fail("Ese email ya tiene una cuenta.");
  }

  try {
    await prisma.adminUser.update({ where: { id: s.adminId }, data: { name: name || null, ...(emailChanged ? { email } : {}) } });
  } catch {
    return fail("No pudimos guardar los cambios. Probá de nuevo.");
  }
  revalidatePath("/admin/account");
  return done(emailChanged ? "Guardado. Desde ahora ingresás con el nuevo email." : "Guardado.");
}

// ------------------------------------------------------------------------------------------ seguridad

async function revokeOthers(adminId: string, businessId: string, sid: string | undefined) {
  const current = await ensureCurrentSessionRow({ adminId, businessId, sid });
  const now = new Date();
  await prisma.$transaction([
    prisma.adminSession.updateMany({ where: { adminId, revokedAt: null, id: { not: current } }, data: { revokedAt: now } }),
    // También invalida los tokens viejos que no tienen id de sesión (la sesión actual ya tiene el suyo).
    prisma.adminUser.update({ where: { id: adminId }, data: { tokensValidAfter: now } }),
  ]);
}

export async function changePassword(_p: FormState, fd: FormData): Promise<FormState> {
  const s = await requireAdmin();
  const current = str(fd, "currentPassword", 100);
  const next = str(fd, "newPassword", 200);
  const confirm = str(fd, "confirmPassword", 200);

  if (!current) return fail("Ingresá tu contraseña actual.");
  if (next.length < 8) return fail("La nueva contraseña debe tener al menos 8 caracteres.");
  if (next.length > 100) return fail("La nueva contraseña es muy larga (máximo 100 caracteres).");
  if (!/[A-Za-z]/.test(next) || !/\d/.test(next)) return fail("La nueva contraseña tiene que combinar letras y números.");
  if (next !== confirm) return fail("La confirmación no coincide con la nueva contraseña.");
  if (next === current) return fail("La nueva contraseña tiene que ser distinta de la actual.");

  const bad = await checkPassword(s.adminId, current);
  if (bad) return fail(bad);

  await prisma.adminUser.update({ where: { id: s.adminId }, data: { passwordHash: await bcrypt.hash(next, 10) } });
  // Por seguridad, al cambiar la contraseña se cierran las demás sesiones.
  await revokeOthers(s.adminId, s.businessId, s.sid);
  revalidatePath("/admin/account");
  return done("Contraseña actualizada. Cerramos las sesiones de tus otros dispositivos.");
}

export async function revokeAllOtherSessions(_p: FormState, _fd: FormData): Promise<FormState> {
  const s = await requireAdmin();
  await revokeOthers(s.adminId, s.businessId, s.sid);
  revalidatePath("/admin/account");
  return done("Cerramos todas las demás sesiones. Esta sigue abierta.");
}

/** Cierra una sesión puntual (siempre una propia y distinta de la actual; para esta está «Salir»). */
export async function revokeSession(fd: FormData): Promise<void> {
  const s = await requireAdmin();
  const id = str(fd, "id", 60);
  if (!id || id === s.sid) return;
  await prisma.adminSession.updateMany({ where: { id, adminId: s.adminId, revokedAt: null }, data: { revokedAt: new Date() } });
  revalidatePath("/admin/account");
}

// ------------------------------------------------------------------------------------------ preferencias

const validTimeZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat("es", { timeZone: tz });
    return /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/.test(tz);
  } catch {
    return false;
  }
};

export async function savePreferences(_p: FormState, fd: FormData): Promise<FormState> {
  const s = await requireAdmin();
  const timezone = str(fd, "timezone", 60).trim();
  if (!validTimeZone(timezone)) return fail("Elegí una zona horaria válida.");
  const emailNotifications = fd.get("emailNotifications") === "on";
  await prisma.$transaction([
    prisma.business.update({ where: { id: s.businessId }, data: { timezone } }),
    prisma.adminUser.update({ where: { id: s.adminId }, data: { emailNotifications } }),
  ]);
  revalidatePath("/admin", "layout");
  return done("Preferencias guardadas.");
}

// ------------------------------------------------------------------------------------------ eliminar la cuenta

export async function deleteAccount(_p: FormState, fd: FormData): Promise<FormState> {
  const s = await requireAdmin();
  const business = await prisma.business.findUnique({
    where: { id: s.businessId },
    select: { id: true, name: true, logoUrl: true, barbers: { select: { photoUrl: true } }, photos: { select: { url: true, posterUrl: true } }, subscription: { select: { mpPreapprovalId: true, mpStatus: true } } },
  });
  if (!business) return fail("No encontramos la barbería.");

  if (str(fd, "confirm", 60).trim() !== "ELIMINAR") return fail("Para confirmar, escribí ELIMINAR (en mayúsculas).");
  const bad = await checkPassword(s.adminId, str(fd, "password", 100));
  if (bad) return fail(bad);

  // Si hay una suscripción activa hay que darla de baja ANTES: si no, Mercado Pago seguiría cobrando.
  const sub = business.subscription;
  if (sub?.mpPreapprovalId && sub.mpStatus !== "cancelled") {
    if (!billingConfigured()) return fail("No pudimos cancelar tu suscripción en Mercado Pago. Cancelala desde «Suscripción» y volvé a intentar.");
    try {
      await cancelSubscriptionFor(business.id);
    } catch {
      return fail("No pudimos cancelar tu suscripción en Mercado Pago, así que no eliminamos nada. Probá de nuevo en unos minutos o cancelala desde «Suscripción».");
    }
  }

  // Los turnos primero (apuntan a servicios y clientes), después el negocio: el resto se borra en cascada.
  await prisma.$transaction([prisma.appointment.deleteMany({ where: { businessId: business.id } }), prisma.business.delete({ where: { id: business.id } })]);

  // Archivos subidos (mejor esfuerzo: si alguno falla, la cuenta ya está eliminada igual).
  const urls = [business.logoUrl, ...business.barbers.map((b) => b.photoUrl), ...business.photos.flatMap((p) => [p.url, p.posterUrl])];
  await Promise.allSettled(urls.map((u) => deleteImage(u)));

  await endCurrentSession();
  redirect("/?cuenta=eliminada");
}
