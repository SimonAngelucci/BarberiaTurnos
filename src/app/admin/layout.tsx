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
import { PanelShell } from "@/components/PanelShell";

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
  { href: "/admin/barbers", label: "Profesionales" },
  { href: "/admin/customers", label: "Clientes" },
  { href: "/admin/schedule", label: "Horarios" },
  { href: "/admin/economia", label: "Economía" },
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
  // Todo lo que depende de la ruta (menú visible, pantallas sin menú, solo lectura) lo resuelve <PanelShell> en el navegador:
  // este layout se conserva al navegar y no puede decidirlo por la ruta con la que se cargó la página.
  const session = await getSession();
  const business = session ? await prisma.business.findUnique({ where: { id: session.businessId }, omit: { mpAccessToken: true } }) : null;
  const access = business ? await getAccess(business.id) : null;
  // Reseñas de clientes esperando aprobación (se muestra como globito en «Personalización»). Si falla, el panel igual carga.
  const pendingReviews = business ? await prisma.review.count({ where: { businessId: business.id, status: "PENDING" } }).catch(() => 0) : 0;

  let publicUrl = "";
  if (business) {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    publicUrl = `${proto}://${host}/b/${business.slug}`;
  }

  const chrome = (
    <>
      {business && <AdminNav links={links} logoUrl={business.logoUrl} pendingReviews={pendingReviews} />}
      {access && <BillingBanner a={access} />}
      {business && (
        <div className="card mb-6 !py-2">
          <div className="text-xs text-neutral-500">Link de tu página de reservas</div>
          <CopyLink url={publicUrl} />
        </div>
      )}
    </>
  );

  return (
    <>
      {business && <style dangerouslySetInnerHTML={{ __html: themeCss(business.primaryColor, business.applyBgToAdmin ? business.bgColor : "#fafafa") }} />}
      {/* En solo lectura se deshabilitan los formularios del panel (salvo Suscripción y Mi cuenta). La defensa real está en el
          servidor: las acciones exigen la suscripción al día. */}
      <PanelShell chrome={chrome} readonly={!!access?.readonly}>
        {children}
      </PanelShell>
      {business && business.onboardingStep < 4 && <OnboardingGuide initialStep={business.onboardingStep} publicUrl={publicUrl} />}
    </>
  );
}