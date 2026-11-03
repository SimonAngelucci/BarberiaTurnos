import Link from "next/link";
import { headers } from "next/headers";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { themeCss } from "@/lib/format";
import { LogoutButton } from "@/components/LogoutButton";
import { CopyLink } from "@/components/CopyLink";

export const dynamic = "force-dynamic";

const links = [
  { href: "/admin", label: "Turnos" },
  { href: "/admin/services", label: "Servicios" },
  { href: "/admin/barbers", label: "Barberos" },
  { href: "/admin/schedule", label: "Horarios" },
  { href: "/admin/settings", label: "Negocio" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const business = session ? await prisma.business.findUnique({ where: { id: session.businessId } }) : null;

  let publicUrl = "";
  if (business) {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    publicUrl = `${proto}://${host}/b/${business.slug}`;
  }

  return (
    <div className="mx-auto min-h-screen max-w-4xl px-4 py-4">
      {business && (
        <style dangerouslySetInnerHTML={{ __html: themeCss(business.primaryColor, business.applyBgToAdmin ? business.bgColor : "#fafafa") }} />
      )}
      {business && (
        <nav className="card mb-3 flex items-center gap-1 overflow-x-auto !p-2">
          {business.logoUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={business.logoUrl} alt="" className="mr-2 h-8 w-8 shrink-0 rounded-full object-cover" />}
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium hover:bg-neutral-100">
              {l.label}
            </Link>
          ))}
          <div className="ml-auto">
            <LogoutButton />
          </div>
        </nav>
      )}
      {business && (
        <div className="card mb-6 !py-2">
          <div className="text-xs text-neutral-500">Link de tu página de reservas</div>
          <CopyLink url={publicUrl} />
        </div>
      )}
      {children}
    </div>
  );
}
