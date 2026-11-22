import { PageHero } from "@/components/ui/PageHero";
import { LogoutButton } from "@/components/LogoutButton";
import { QuickLinks, PANEL_SHORTCUTS as GO } from "@/components/ui/QuickLinks";
import { headers } from "next/headers";
import { prisma, getBusinessById } from "@/lib/db";
import { getSession, requireAdmin } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { fmtDate, getAccess } from "@/lib/billing";
import Link from "next/link";
import { describeDevice } from "@/lib/ua";
import { ActionForm } from "@/components/ActionForm";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { PasswordPair } from "@/components/ui/PasswordPair";
import { changePassword, deleteAccount, revokeAllOtherSessions, revokeSession, saveAccount, savePreferences } from "./actions";

export const dynamic = "force-dynamic";

function Section({ id, title, hint, danger, children }: { id: string; title: string; hint?: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <section id={id} className={`card scroll-mt-4 space-y-4 ${danger ? "!border-red-200" : ""}`}>
      <div>
        <h2 className={`font-semibold ${danger ? "text-red-700" : ""}`}>{title}</h2>
        {hint && <p className="text-sm text-neutral-500">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function timeZones(current: string): string[] {
  let list: string[] = [];
  try {
    list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    list = [];
  }
  if (!list.length) list = ["America/Argentina/Buenos_Aires", "America/Montevideo", "America/Santiago", "America/Bogota", "America/Lima", "America/Mexico_City", "America/Sao_Paulo", "Europe/Madrid", "UTC"];
  return [...new Set([current, ...list])].sort();
}

export default async function AccountPage() {
  const s = await requireAdmin();
  const session = await getSession();
  const [access, business, admin, sessions] = await Promise.all([
    getAccess(s.businessId),
    getBusinessById(s.businessId),
    prisma.adminUser.findUnique({ where: { id: s.adminId }, select: { email: true, name: true, emailNotifications: true, createdAt: true } }),
    prisma.adminSession.findMany({ where: { adminId: s.adminId, revokedAt: null }, orderBy: { lastSeenAt: "desc" }, take: 30 }),
  ]);
  if (!admin) return null;
  const plan = access.sub.planId ? await prisma.plan.findUnique({ where: { id: access.sub.planId }, select: { name: true } }) : null;
  const STATUS: Record<string, [string, string]> = {
    TRIAL: ["Prueba gratis", "bg-green-100 text-green-800"],
    ACTIVE: ["Activa", "bg-green-100 text-green-800"],
    PAST_DUE: ["Pago pendiente", "bg-red-100 text-red-800"],
    CANCELED: ["Cancelada", "bg-amber-100 text-amber-800"],
    EXPIRED: ["Prueba terminada", "bg-red-100 text-red-800"],
  };
  const [statusLabel, statusTone] = STATUS[access.status] ?? [access.status, "bg-neutral-200 text-neutral-700"];

  const currentSid = session?.sid;
  const h = await headers();
  const hasCurrentRow = !!currentSid && sessions.some((x) => x.id === currentSid);
  const others = sessions.filter((x) => x.id !== currentSid);

  return (
    <div className="space-y-4">
      <PageHero title="Mi cuenta" subtitle={<>Tus datos de acceso, la seguridad y las preferencias. Cuenta creada el {fmtDateTime(admin.createdAt, business.timezone)}.</>}>
        <QuickLinks items={[GO.personalizacion, GO.clientes, GO.profesionales, GO.pagos]} />
      </PageHero>

      <Section id="datos" title="Datos de la cuenta" hint="Con este email ingresás al panel.">
        <ActionForm action={saveAccount} submitLabel="Guardar datos">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="name">
                Nombre del responsable
              </label>
              <input id="name" name="name" maxLength={80} autoComplete="name" defaultValue={admin.name ?? ""} placeholder="Ej: Lucas Pérez" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="email">
                Email
              </label>
              <input id="email" name="email" type="email" required maxLength={200} autoComplete="email" defaultValue={admin.email} className="input" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="acct-current">
              Contraseña actual <span className="font-normal text-neutral-400">(solo si cambiás el email)</span>
            </label>
            <div className="sm:max-w-sm"><PasswordInput id="acct-current" name="currentPassword" autoComplete="current-password" /></div>
          </div>
        </ActionForm>
      </Section>

      <Section id="seguridad" title="Seguridad" hint="Al cambiar la contraseña se cierran tus otras sesiones abiertas.">
        <ActionForm action={changePassword} submitLabel="Cambiar contraseña" resetOnSuccess>
          <div>
            <label className="label" htmlFor="pw-current">
              Contraseña actual
            </label>
            <div className="sm:max-w-sm"><PasswordInput id="pw-current" name="currentPassword" required autoComplete="current-password" /></div>
          </div>
          <PasswordPair newLabel="Nueva contraseña" confirmLabel="Repetir nueva contraseña" hint="Mínimo 8 caracteres, con letras y números." />
        </ActionForm>
      </Section>

      <Section id="suscripcion" title="Suscripción" hint="Tu plan, el estado de tu cuenta y los pagos.">
        {access.exempt ? (
          <p className="text-sm text-neutral-600">Tu cuenta no requiere suscripción.</p>
        ) : (
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-neutral-500">Plan</dt>
              <dd className="font-semibold">{plan?.name ?? "Sin plan elegido"}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Estado</dt>
              <dd>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusTone}`}>{statusLabel}</span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">{access.status === "TRIAL" ? "La prueba termina" : "Acceso completo hasta"}</dt>
              <dd className="font-semibold">
                {access.status === "TRIAL" ? fmtDate(access.sub.trialEndsAt) : access.accessUntil ? fmtDate(access.accessUntil) : "—"}
                {access.trialDaysLeft !== null && access.status === "TRIAL" && <span className="ml-1 font-normal text-neutral-500">({access.trialDaysLeft} {access.trialDaysLeft === 1 ? "día" : "días"})</span>}
              </dd>
            </div>
          </dl>
        )}
        {!access.exempt && (
          <Link href="/admin/billing" className="btn inline-flex w-fit items-center gap-2">
            Gestionar suscripción
          </Link>
        )}
      </Section>
      <Section id="apariencia" title="Apariencia" hint="Elegí el tema del panel. «Sistema» usa el de tu dispositivo.">
        <ThemeToggle />
      </Section>

      <Section id="sesiones" title="Sesiones activas" hint="Dispositivos donde tu cuenta tiene la sesión abierta. Si no reconocés alguno, cerralo y cambiá tu contraseña.">
        <ul className="space-y-2">
          {/* Esta sesión: si es de las antiguas (sin registro propio) se describe con los datos del pedido actual */}
          {(() => {
            const cur = sessions.find((x) => x.id === currentSid);
            const d = describeDevice(cur?.userAgent ?? h.get("user-agent"));
            return (
              <li className="flex flex-wrap items-center gap-3 rounded-xl border border-green-200 bg-green-50/50 p-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">
                    {d.browser} en {d.os} <span className="text-neutral-500">· {d.kind}</span>
                  </div>
                  <div className="text-xs text-neutral-500">{hasCurrentRow && cur ? `Iniciada el ${fmtDateTime(cur.createdAt, business.timezone)}` : "Sesión iniciada antes de esta función"}</div>
                </div>
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Esta sesión</span>
              </li>
            );
          })()}
          {others.map((x) => {
            const d = describeDevice(x.userAgent);
            return (
              <li key={x.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-200 p-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">
                    {d.browser} en {d.os} <span className="text-neutral-500">· {d.kind}</span>
                  </div>
                  <div className="text-xs text-neutral-500">
                    Último acceso: {fmtDateTime(x.lastSeenAt, business.timezone)}
                    {x.ip ? ` · IP ${x.ip}` : ""}
                  </div>
                </div>
                <form action={revokeSession}>
                  <input type="hidden" name="id" value={x.id} />
                  <button className="btn-ghost !border-red-300 !text-red-600">Cerrar sesión</button>
                </form>
              </li>
            );
          })}
          {others.length === 0 && <li className="text-sm text-neutral-500">No hay otras sesiones abiertas.</li>}
        </ul>
        {others.length > 0 && (
          <ActionForm action={revokeAllOtherSessions} submitLabel="Cerrar todas las demás sesiones" buttonClassName="btn-ghost !border-red-300 !text-red-600" confirm="¿Cerrar la sesión en todos los demás dispositivos?">
            <p className="text-xs text-neutral-500">Esta sesión (la de este dispositivo) sigue abierta.</p>
          </ActionForm>
        )}
      </Section>

      <Section id="preferencias" title="Preferencias de la cuenta">
        <ActionForm action={savePreferences} submitLabel="Guardar preferencias">
          <div>
            <span className="label">Idioma</span>
            <p className="text-sm">Español</p>
            <p className="text-xs text-neutral-400">Por ahora la plataforma está disponible solo en español.</p>
          </div>
          <div>
            <label className="label" htmlFor="timezone">
              Zona horaria
            </label>
            <select id="timezone" name="timezone" defaultValue={business.timezone} className="input sm:max-w-sm">
              {timeZones(business.timezone).map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace(/_/g, " ")}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-neutral-400">Define los horarios de tus turnos y recordatorios. Es la misma que figura en «Negocio».</p>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="emailNotifications" defaultChecked={admin.emailNotifications} className="mt-1" />
            <span>
              <strong>Recibir avisos importantes por email</strong>
              <span className="block text-xs text-neutral-500">Novedades de tu suscripción, cobros y seguridad de la cuenta.</span>
            </span>
          </label>
        </ActionForm>
      </Section>

      <section className="card flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Cerrar sesión</h2>
          <p className="text-sm text-muted">Salís de este dispositivo; tus datos quedan guardados.</p>
        </div>
        <LogoutButton />
      </section>

      <Section id="peligro" title="Zona de peligro" danger>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Exportar los datos de la cuenta</h3>
          <p className="text-sm text-neutral-500">Descargá un archivo con tu negocio, servicios, profesionales, clientes, turnos y reseñas. No incluye contraseñas ni credenciales.</p>
          <a href="/api/admin/export" download className="btn-ghost mt-1 inline-flex">
            Descargar mis datos (JSON)
          </a>
        </div>

        <div className="space-y-2 border-t border-red-100 pt-4">
          <h3 className="text-sm font-semibold text-red-700">Eliminar la cuenta</h3>
          <p className="text-sm text-neutral-600">
            Se elimina <strong>{business.name}</strong> de forma permanente: página de reservas, servicios, profesionales, clientes, turnos, reseñas y fotos. Si tenés una suscripción activa, se cancela. <strong>No se puede deshacer</strong>; si querés
            conservar tu información, exportala antes.
          </p>
          <details className="rounded-xl border border-red-200 p-3">
            <summary className="cursor-pointer text-sm font-medium text-red-700">Quiero eliminar mi cuenta</summary>
            <div className="mt-3">
              <ActionForm action={deleteAccount} submitLabel="Eliminar mi cuenta definitivamente" buttonClassName="btn !bg-red-600 !text-white" confirm="Última confirmación: se va a eliminar tu cuenta y todos sus datos para siempre. ¿Continuar?">
                <div>
                  <label className="label" htmlFor="del-confirm">
                    Para confirmar, escribí <strong>ELIMINAR</strong>
                  </label>
                  <input id="del-confirm" name="confirm" required autoComplete="off" className="input sm:max-w-xs" />
                </div>
                <div>
                  <label className="label" htmlFor="del-pw">
                    Tu contraseña
                  </label>
                  <input id="del-pw" name="password" type="password" required autoComplete="current-password" className="input sm:max-w-xs" />
                </div>
              </ActionForm>
            </div>
          </details>
        </div>
      </Section>
    </div>
  );
}
