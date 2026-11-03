import Link from "next/link";
import { getSession } from "@/lib/auth";
import { LogoutButton } from "@/components/LogoutButton";

const links = [
  { href: "/admin", label: "Turnos" },
  { href: "/admin/services", label: "Servicios" },
  { href: "/admin/schedule", label: "Horarios" },
  { href: "/admin/settings", label: "Negocio" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <div className="mx-auto max-w-4xl px-4 py-4">
      {session && (
        <nav className="mb-6 flex items-center gap-1 overflow-x-auto rounded-2xl border border-neutral-200 bg-white p-2">
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
      {children}
    </div>
  );
}
