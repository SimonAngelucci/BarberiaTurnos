import type { Metadata } from "next";
import Link from "next/link";
import { getSuperSession } from "@/lib/platform-auth";
import { SuperLogout } from "@/components/SuperLogout";

export const metadata: Metadata = { title: "Super Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const links = [
  { href: "/superadmin", label: "Resumen" },
  { href: "/superadmin/businesses", label: "Barberías" },
  { href: "/superadmin/plans", label: "Planes" },
  { href: "/superadmin/creators", label: "Creadores" },
];

export default async function SuperLayout({ children }: { children: React.ReactNode }) {
  const session = await getSuperSession(); // sin sesión solo se ve el login (el middleware ya redirige el resto)
  return (
    <div className="mx-auto min-h-screen max-w-6xl px-4 py-4">
      {session && (
        <nav className="card mb-6 flex items-center gap-1 overflow-x-auto !p-2">
          <span className="mr-2 rounded-lg bg-neutral-900 px-2.5 py-1 text-xs font-bold text-white">SUPER ADMIN</span>
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium hover:bg-neutral-100">
              {l.label}
            </Link>
          ))}
          <div className="ml-auto">
            <SuperLogout />
          </div>
        </nav>
      )}
      {children}
    </div>
  );
}
