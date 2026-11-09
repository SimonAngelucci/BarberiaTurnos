import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fmtDate, getAccess, type Access } from "@/lib/billing";
import { themeCss } from "@/lib/format";
import { CopyLink } from "@/components/CopyLink";
import { OnboardingGuide } from "@/components/OnboardingGuide";
import { AdminNav, type NavLink } from "@/components/AdminNav";

export const dynamic = "force-dynamic";

/**
 * Ícono de la pestaña del panel: el logo del negocio teñido de rojo (lo genera /admin/favicon). Sin sesión (login) queda el
 * ícono por defecto. La versión (?v) cambia con el logo para que el navegador no use uno viejo.
 */
export async function generateMetadata(): Promise<Metadata> {
  const session = await getSession();
  if (!session) return {};
  const biz = await prisma.business.findUnique({ where: { id: session.businessId }, select: { logoUrl: true } });
  const v = (biz?.logoUrl ?? "none").split("").reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36);
  const href = `/admin/favicon?v=${v}`;
  return { icons: { icon: [{ url: href }], shortcut: [{ url: href }], apple: [{ url: href }] } };
}

const links: NavLink[] = [
  { href: "/admin", label: "Turnos" },
  { href: "/admin/turnos", label: "En vivo" },
  { href: "/admin/services", label: "Servicios" },
  { href: "/admin/barbers", label: "Barberos" },
  { href: "/admin/customers", label: "Clientes" },
  { href: "/admin/schedule", label: "Horarios" },
  { href: "/admin/payments", label: "Pagos" },
  // Personalización reúne Negocio, Diseño y Mi página: las rutas viejas también la dejan marcada.
  { href: "/admin/personalizacion", label: "Personalización", also: ["/admin/settings", "/admin/design", "/admin/profile"], badge: true },
  { href: "/admin/billing", label: "Suscripción" },
  { href: "/admin/account", label: "Mi cuenta" },
];


/** Estado de la suscripción, siempre visible en el panel. Devuelve null cuando no hay nada que avisar. */
function BillingBanner({ a }: { a: Access }) {
  if (a.exempt) return null;
  const cta = (label: string) => (
    <Link href="/admin/billing" className="ml-2 font-semibold underline">
      {label}
    </Link>
  );
  const box = (tone: "info" | "warn" | "bad", children: React.ReactNode) => (
    <div
      role={tone === "bad" ? "alert" : "status"}
      className={`mb-3 rounded-xl border p-3 text-sm ${tone === "info" ? "border-green-200 bg-green-50 text-green-900" : tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-red-200 bg-red-50 text-red-800"}`}
    >
      {children}
    </div>
  );

  switch (a.status) {
    case "TRIAL":
      if (a.awaitingCharge) return box("warn", <>Estamos esperando la confirmación del primer cobro de tu suscripción. Si ya autorizaste el pago, se actualiza solo en unos minutos.</>);
      return box(
        "info",
        <>
          🎁 <strong>Prueba gratis:</strong> te {a.trialDaysLeft === 1 ? "queda 1 día" : `quedan ${a.trialDaysLeft} días`}.
          {a.sub.mpStatus === "authorized" ? <> Tu suscripción ya está autorizada: el primer cobro será al terminar la prueba.</> : <> Elegí un plan antes de que termine para no perder el acceso.</>}
          {cta(a.sub.mpStatus === "authorized" ? "Ver mi suscripción" : "Elegir plan")}
        </>,
      );
    case "PAST_DUE":
      return box("bad", <>No pudimos cobrar tu suscripción. Tu cuenta está en <strong>modo solo lectura</strong> y no recibe reservas nuevas hasta que regularices el pago.{cta("Regularizar pago")}</>);
    case "EXPIRED":
      return box("bad", <>Tu prueba gratis terminó. Tu cuenta está en <strong>modo solo lectura</strong> y no recibe reservas nuevas.{cta("Elegir un plan")}</>);
    case "CANCELED":
      return a.readonly
        ? box("bad", <>Tu suscripción está cancelada y el acceso terminó: la cuenta está en <strong>modo solo lectura</strong>.{cta("Reactivar")}</>)
        : box("warn", <>Cancelaste tu suscripción. Seguís teniendo acceso completo hasta el {a.accessUntil ? fmtDate(a.accessUntil) : "fin del período"}.{cta("Reactivar")}</>);
    default:
      return null;
  }
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // El login vive dentro de /admin pero no es parte del panel: sin menú, sin aviso de suscripción ni barra del link público,
  // aunque ya haya una sesión iniciada. (Tampoco se consulta la base: no hace falta para mostrar el formulario.)
  const path = (await headers()).get("x-pathname") ?? "";
  // La vista de Turnos tiene su propia pantalla completa (sin menú), con su propio encabezado y campanita.
  if (path === "/admin/turnos") return <div className="mx-auto min-h-screen max-w-5xl px-4 py-4">{children}</div>;
  if (path === "/admin/login") return <div className="mx-auto min-h-screen max-w-4xl px-4 py-4">{children}</div>;

  const session = await getSession();
  const business = session ? await prisma.business.findUnique({ where: { id: session.businessId }, omit: { mpAccessToken: true } }) : null;
  const access = business ? await getAccess(business.id) : null;
  // Reseñas de clientes esperando aprobación (se muestra como globito en «Mi página»). Si falla, el panel igual carga.
  const pendingReviews = business ? await prisma.review.count({ where: { businessId: business.id, status: "PENDING" } }).catch(() => 0) : 0;

  let publicUrl = "";
  if (business) {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    publicUrl = `${proto}://${host}/b/${business.slug}`;
  }

  // En solo lectura se deshabilitan todos los formularios del panel (salvo la pantalla de suscripción, que tiene que seguir
  // funcionando para poder regularizar). La defensa real está en el servidor: las acciones exigen la suscripción al día.
  // «Mi cuenta» tampoco se bloquea: cambiar la contraseña, exportar los datos o darse de baja tiene que poder hacerse siempre.
  const lock = !!access?.readonly && !path.startsWith("/admin/billing") && !path.startsWith("/admin/account");

  return (
    <div className="mx-auto min-h-screen max-w-4xl px-4 py-4">
      {business && (
        <style dangerouslySetInnerHTML={{ __html: themeCss(business.primaryColor, business.applyBgToAdmin ? business.bgColor : "#fafafa") }} />
      )}
      {business && (
        <AdminNav links={links} logoUrl={business.logoUrl} pendingReviews={pendingReviews} />
      )}
      {access && <BillingBanner a={access} />}
      {business && (
        <div className="card mb-6 !py-2">
          <div className="text-xs text-neutral-500">Link de tu página de reservas</div>
          <CopyLink url={publicUrl} />
        </div>
      )}
      <fieldset disabled={lock} className="m-0 min-w-0 border-0 p-0">
        {children}
      </fieldset>
      {business && business.onboardingStep < 4 && <OnboardingGuide initialStep={business.onboardingStep} publicUrl={publicUrl} />}
    </div>
  );
}
