import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getBusiness } from "@/lib/db";
import { contrastFg } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const b = await getBusiness();
  return {
    title: `${b.name} · Turnos`,
    description: b.tagline,
    icons: b.logoUrl ? { icon: b.logoUrl } : undefined,
  };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const b = await getBusiness();
  const theme = `:root{--brand:${b.primaryColor};--brand-fg:${contrastFg(b.primaryColor)}}`;
  return (
    <html lang="es">
      <head>
        <style dangerouslySetInnerHTML={{ __html: theme }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
