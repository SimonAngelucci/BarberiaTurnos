import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: "var(--brand)",
        "brand-fg": "var(--brand-fg)",
      },
    },
  },
  plugins: [],
} satisfies Config;
