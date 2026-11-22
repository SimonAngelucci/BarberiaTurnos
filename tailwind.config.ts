import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["var(--font-sans)", ...defaultTheme.fontFamily.sans] },
      colors: {
        brand: "var(--brand)",
        "brand-fg": "var(--brand-fg)",
        // Tokens del sistema visual (definidos en globals.css; cambian solos con el modo oscuro y el color del negocio).
        primary: "var(--primary)",
        "primary-strong": "var(--primary-strong)",
        "on-primary": "var(--on-primary)",
        surface: "var(--surface)",
        "surface-muted": "var(--surface-muted)",
        ink: "var(--ink)",
        "ink-soft": "var(--ink-soft)",
        "ink-line": "var(--ink-line)",
        muted: "var(--text-muted)",
      },
    },
  },
  plugins: [],
} satisfies Config;