import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Turnos online para tu negocio",
  description: "Reservas online para tu negocio, con link propio.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

// El tema (colores/logo) lo inyecta cada sección: /b/[slug] para la página pública y /admin para el panel.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
