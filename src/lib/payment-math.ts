// Lógica pura de montos y opciones de pago. Sin dependencias de servidor: la usan el cliente (para mostrar)
// y el servidor (para decidir). El servidor SIEMPRE recalcula; nunca confía en un monto que venga del navegador.

export type PayMode = "DEPOSIT_ONLY" | "FULL_ONLY" | "BOTH";
export type PayChoice = "NONE" | "DEPOSIT" | "FULL";

export type PayConfig = {
  enabled: boolean;
  mode: PayMode;
  depositType: "PERCENT" | "FIXED";
  /** PERCENT: 1–100. FIXED: centavos. */
  depositValue: number;
  allowPayLater: boolean;
};

/** Minutos que se retiene el horario mientras el cliente paga. */
export const HOLD_MINUTES = 20;

/** Seña en centavos, redondeada a pesos enteros y nunca mayor al total. */
export function depositCents(priceCents: number, cfg: Pick<PayConfig, "depositType" | "depositValue">) {
  const raw = cfg.depositType === "PERCENT" ? (priceCents * cfg.depositValue) / 100 : cfg.depositValue;
  return Math.min(priceCents, Math.max(100, Math.round(raw / 100) * 100));
}

export type PayOption = { choice: PayChoice; amountCents: number };

/** Opciones que se le ofrecen al cliente para un servicio de ese precio. */
export function payOptions(priceCents: number, cfg: PayConfig): PayOption[] {
  const later: PayOption[] = [{ choice: "NONE", amountCents: 0 }];
  if (!cfg.enabled || priceCents <= 0) return later;

  const dep = depositCents(priceCents, cfg);
  const opts: PayOption[] = [];
  // Si la seña iguala al total, "seña" y "total" son lo mismo: se ofrece solo el total.
  if (cfg.mode !== "FULL_ONLY" && dep < priceCents) opts.push({ choice: "DEPOSIT", amountCents: dep });
  if (cfg.mode !== "DEPOSIT_ONLY" || dep >= priceCents) opts.push({ choice: "FULL", amountCents: priceCents });
  return cfg.allowPayLater ? [...opts, ...later] : opts;
}
