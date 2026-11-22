import type { Metadata, Viewport } from "next";
import "./globals.css";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Turnos online para tu negocio",
  description: "Reservas online para tu negocio, con link propio.",
};

// viewportFit "cover" habilita env(safe-area-inset-*) en iOS: las barras fijas respetan la muesca.
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

// El tema (colores/logo) lo inyecta cada sección: /b/[slug] para la página pública y /admin para el panel.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme lo fija el script del <head> antes de pintar (evita el destello del tema equivocado): por eso suppressHydrationWarning.
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
