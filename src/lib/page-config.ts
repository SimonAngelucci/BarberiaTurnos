import { z } from "zod";

// Modelo del diseño de la página pública. Se guarda como JSON en Business.pageConfig.
// Es un diseño por BLOQUES (no posiciones en píxeles): así se adapta solo a celular y escritorio.
// El mismo esquema valida lo que llega del editor (servidor) y lo que se lee de la base (si está dañado, cae al diseño por defecto).

export const FONT_KEYS = ["system", "inter", "poppins", "montserrat", "playfair", "oswald", "bebas", "lora", "robotoslab"] as const;
export type FontKey = (typeof FONT_KEYS)[number];

/** Tipografías permitidas (lista cerrada: nunca se carga una fuente arbitraria). */
export const FONTS: Record<FontKey, { label: string; css: string | undefined; google: string | null }> = {
  system: { label: "Predeterminada", css: undefined, google: null },
  inter: { label: "Inter", css: "'Inter', sans-serif", google: "Inter:wght@400;500;600;700" },
  poppins: { label: "Poppins", css: "'Poppins', sans-serif", google: "Poppins:wght@400;500;600;700" },
  montserrat: { label: "Montserrat", css: "'Montserrat', sans-serif", google: "Montserrat:wght@400;500;600;700" },
  playfair: { label: "Playfair Display (elegante)", css: "'Playfair Display', serif", google: "Playfair+Display:wght@400;500;600;700" },
  oswald: { label: "Oswald (compacta)", css: "'Oswald', sans-serif", google: "Oswald:wght@400;500;600;700" },
  bebas: { label: "Bebas Neue (titulares)", css: "'Bebas Neue', sans-serif", google: "Bebas+Neue" },
  lora: { label: "Lora (clásica)", css: "'Lora', serif", google: "Lora:wght@400;500;600;700" },
  robotoslab: { label: "Roboto Slab", css: "'Roboto Slab', serif", google: "Roboto+Slab:wght@400;500;600;700" },
};

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const n = (min: number, max: number) => z.number().min(min).max(max);
const id = z.string().regex(/^[A-Za-z0-9_-]{1,24}$/);
const align = z.enum(["left", "center", "right"]);
const font = z.enum(FONT_KEYS).nullable();
const weight = z.union([z.literal(400), z.literal(500), z.literal(600), z.literal(700)]);

const textStyle = {
  size: n(10, 96),
  weight,
  color: hex.nullable(),
  opacity: n(0.2, 1),
  align,
  font,
  widthPct: n(20, 100),
  mt: n(0, 120),
  mb: n(0, 120),
};

const logo = z.object({ id, type: z.literal("logo"), size: n(32, 240), shape: z.enum(["circle", "rounded", "square"]), align, mt: n(0, 120), mb: n(0, 120) });
const title = z.object({ id, type: z.literal("title"), text: z.string().max(120).nullable(), ...textStyle });
const tagline = z.object({ id, type: z.literal("tagline"), text: z.string().max(160).nullable(), ...textStyle });
const text = z.object({ id, type: z.literal("text"), text: z.string().max(600), ...textStyle });
const spacer = z.object({ id, type: z.literal("spacer"), height: n(0, 240) });
const booking = z.object({ id, type: z.literal("booking"), widthPct: n(40, 100), scale: n(0.8, 1.3), color: hex.nullable(), mt: n(0, 120), mb: n(0, 120) });

export const configSchema = z
  .object({
    v: z.literal(1),
    global: z.object({ font: z.enum(FONT_KEYS), maxWidth: n(360, 1000), cardRadius: n(0, 32) }),
    blocks: z.array(z.discriminatedUnion("type", [logo, title, tagline, text, spacer, booking])).min(1).max(30),
  })
  .superRefine((c, ctx) => {
    const ids = c.blocks.map((b) => b.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "Bloques duplicados" });
    const count = (t: string) => c.blocks.filter((b) => b.type === t).length;
    if (count("booking") !== 1) ctx.addIssue({ code: "custom", message: "Debe haber exactamente un bloque de reservas" });
    for (const t of ["logo", "title", "tagline"]) if (count(t) > 1) ctx.addIssue({ code: "custom", message: `Solo puede haber un bloque ${t}` });
  });

export type PageConfig = z.infer<typeof configSchema>;
export type Block = PageConfig["blocks"][number];
export type TextBlock = Extract<Block, { type: "title" | "tagline" | "text" }>;
export type Align = "left" | "center" | "right";

/** Diseño por defecto: se ve igual que la página antes de existir el editor. */
export function defaultConfig(): PageConfig {
  const t = { weight: 700 as const, color: null, opacity: 1, align: "center" as const, font: null, widthPct: 100, mt: 0, mb: 0 };
  return {
    v: 1,
    global: { font: "system", maxWidth: 512, cardRadius: 16 },
    blocks: [
      { id: "logo", type: "logo", size: 80, shape: "circle", align: "center", mt: 0, mb: 12 },
      { id: "title", type: "title", text: null, size: 24, ...t, mb: 4 },
      { id: "tagline", type: "tagline", text: null, size: 16, ...t, weight: 400, opacity: 0.7, mb: 24 },
      { id: "booking", type: "booking", widthPct: 100, scale: 1, color: null, mt: 0, mb: 0 },
    ],
  };
}

/** Lee el JSON guardado; si falta o está dañado, usa el diseño por defecto. */
export function resolveConfig(raw: unknown): PageConfig {
  const p = configSchema.safeParse(raw);
  return p.success ? p.data : defaultConfig();
}

export const newBlockId = (prefix: string) => `${prefix}${Math.random().toString(36).slice(2, 8)}`;

/**
 * Tamaño de letra adaptable: en pantallas anchas es `size`; en celular se reduce suavemente
 * (los textos chicos, hasta 24px, no se achican). Usa unidades de contenedor (cqw) para que
 * la vista previa "móvil" del editor se comporte igual que un celular real.
 */
export function fluidFont(size: number) {
  const min = size <= 24 ? size : 24 + (size - 24) * 0.45;
  if (min === size) return `${size}px`;
  const slope = ((size - min) * 100) / 340; // cqw por cada 1cqw de ancho entre 360px y 700px
  const base = min - ((size - min) * 360) / 340;
  return `clamp(${min.toFixed(1)}px, calc(${base.toFixed(2)}px + ${slope.toFixed(3)}cqw), ${size}px)`;
}

export const usedFonts = (c: PageConfig): FontKey[] => {
  const set = new Set<FontKey>([c.global.font]);
  for (const b of c.blocks) if ("font" in b && b.font) set.add(b.font);
  return [...set].filter((f) => FONTS[f].google);
};

/** URL de Google Fonts solo con las familias usadas (o null si no hace falta ninguna). */
export function fontsHref(fonts: FontKey[]) {
  const fams = fonts.map((f) => FONTS[f].google).filter(Boolean);
  return fams.length ? `https://fonts.googleapis.com/css2?${fams.map((f) => `family=${f}`).join("&")}&display=swap` : null;
}

export const ALL_FONTS_HREF = fontsHref(FONT_KEYS.filter((f) => FONTS[f].google));
