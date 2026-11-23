import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBusinessBySlug } from "@/lib/db";
import { ownColorCss } from "@/lib/format";

export const dynamic = "force-dynamic";

type Props = { children: React.ReactNode; params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const b = await getBusinessBySlug((await params).slug);
  if (!b) return { title: "Negocio no encontrado" };
  return {
    title: `${b.name} · Turnos`,
    description: b.tagline,
    icons: b.logoUrl ? { icon: b.logoUrl } : undefined,
  };
}

export default async function PublicLayout({ children, params }: Props) {
  const b = await getBusinessBySlug((await params).slug);
  if (!b) notFound();
  return (
    // La web pública usa la misma paleta y componentes que el panel (clase .app-themed). El color propio del negocio es opcional
    // (apagado por defecto) y reemplaza solo al acento.
    <div className="app-themed min-h-screen">
      {b.useOwnColor && <style dangerouslySetInnerHTML={{ __html: ownColorCss(b.primaryColor) }} />}
      {children}
    </div>
  );
}
