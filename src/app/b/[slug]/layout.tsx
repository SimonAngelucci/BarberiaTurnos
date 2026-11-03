import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBusinessBySlug } from "@/lib/db";
import { themeCss } from "@/lib/format";

export const dynamic = "force-dynamic";

type Props = { children: React.ReactNode; params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const b = await getBusinessBySlug((await params).slug);
  if (!b) return { title: "Barbería no encontrada" };
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
    <>
      <style dangerouslySetInnerHTML={{ __html: themeCss(b.primaryColor, b.bgColor) }} />
      {children}
    </>
  );
}
