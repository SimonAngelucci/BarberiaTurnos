import { z } from "zod";

// Validaciones del panel de Super Admin. Se usan en el servidor (y se prueban sin levantar la app).

const emptyToNull = (v: unknown) => (v === "" || v === undefined ? null : v);

export const planSchema = z.object({
  name: z.string().trim().min(2, "Poné un nombre para el plan").max(40),
  description: z.string().trim().max(200).default(""),
  /** En pesos; se guarda en centavos. */
  price: z.coerce.number({ message: "Poné un precio" }).positive("El precio debe ser mayor a 0").max(10_000_000),
  currency: z.string().trim().toUpperCase().length(3, "La moneda son 3 letras (ej. ARS)").default("ARS"),
  /** Vacío = ilimitados. */
  maxBarbers: z.preprocess(emptyToNull, z.coerce.number().int("Debe ser un número entero").min(1).max(500).nullable()),
  /** Una característica por línea. */
  features: z
    .string()
    .max(2000)
    .default("")
    .transform((s) => s.split("\n").map((l) => l.trim()).filter(Boolean))
    .pipe(z.array(z.string().max(80, "Cada característica puede tener hasta 80 caracteres")).max(15, "Hasta 15 características")),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

export const creatorCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9_-]{3,20}$/, "El código lleva de 3 a 20 letras, números, guion o guion bajo (ej. JUAN20)");

export const creatorSchema = z
  .object({
    name: z.string().trim().min(2, "Poné el nombre del creador").max(60),
    email: z.preprocess(emptyToNull, z.string().trim().email("Email inválido").nullable()),
    benefitType: z.enum(["TRACKING", "COMMISSION", "FREE_MONTHS"]),
    commissionPercent: z.coerce.number().int().min(0).max(100).default(0),
    /** Vacío = comisión de por vida. */
    commissionMonths: z.preprocess(emptyToNull, z.coerce.number().int().min(1).max(120).nullable()),
    freeMonths: z.coerce.number().int().min(0).max(24).default(0),
    notes: z.preprocess(emptyToNull, z.string().trim().max(500).nullable()),
  })
  .superRefine((c, ctx) => {
    if (c.benefitType === "COMMISSION" && c.commissionPercent < 1) ctx.addIssue({ code: "custom", path: ["commissionPercent"], message: "Con comisión, el porcentaje tiene que ser de 1 a 100" });
    if (c.benefitType === "FREE_MONTHS" && c.freeMonths < 1) ctx.addIssue({ code: "custom", path: ["freeMonths"], message: "Con meses gratis, indicá al menos 1 mes" });
  });

export const DEFAULT_PLANS = [
  { slug: "basico", name: "Básico", description: "Para empezar con tu negocio", priceCents: 1_500_000, maxBarbers: 2, sortOrder: 1, features: ["Reservas online 24/7", "Recordatorios por WhatsApp", "Página propia con tu link"] },
  { slug: "pro", name: "Pro", description: "Para negocios en crecimiento", priceCents: 2_800_000, maxBarbers: 5, sortOrder: 2, features: ["Todo lo del plan Básico", "Cobro de señas con Mercado Pago", "Editor visual de tu página", "Reprogramar y cancelar con código"] },
  { slug: "premium", name: "Premium", description: "Para cadenas y equipos grandes", priceCents: 4_500_000, maxBarbers: null, sortOrder: 3, features: ["Todo lo del plan Pro", "Profesionales ilimitados", "Soporte prioritario"] },
] as const;
