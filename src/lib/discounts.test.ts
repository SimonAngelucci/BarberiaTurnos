import { describe, expect, it } from "vitest";
import { type DiscountRule, discountAmount, normalizeCoupon, priceFor } from "./discounts";

const TZ = "America/Argentina/Buenos_Aires";
const base: DiscountRule = { id: "d1", name: "Promo", kind: "PERCENT", value: 20, serviceIds: [], weekdays: [], startMin: null, endMin: null, startsAt: null, endsAt: null, active: true, couponCode: null, maxUses: null, usedCount: 0 };
// martes 24/11/2026 10:00 en Argentina
const TUE = new Date("2026-11-24T13:00:00Z");
const args = { serviceId: "s1", priceCents: 1_800_000, startAt: TUE, tz: TZ };

describe("precio final con descuento", () => {
  it("porcentaje: 20% de $18.000 = $14.400", () => {
    const r = priceFor({ ...args, rules: [base] });
    expect(r.discountCents).toBe(360_000);
    expect(r.finalCents).toBe(1_440_000);
    expect(r.originalCents).toBe(1_800_000);
  });

  it("monto fijo, sin pasar nunca del precio", () => {
    expect(priceFor({ ...args, rules: [{ ...base, kind: "FIXED", value: 200_000 }] }).finalCents).toBe(1_600_000);
    expect(priceFor({ ...args, rules: [{ ...base, kind: "FIXED", value: 9_999_999 }] }).finalCents).toBe(0);
    expect(discountAmount({ kind: "PERCENT", value: 150 }, 1000)).toBe(1000);
  });

  it("solo aplica a los servicios elegidos", () => {
    expect(priceFor({ ...args, rules: [{ ...base, serviceIds: ["otro"] }] }).discountCents).toBe(0);
    expect(priceFor({ ...args, rules: [{ ...base, serviceIds: ["s1"] }] }).discountCents).toBeGreaterThan(0);
  });

  it("días de la semana: martes sí, jueves no (zona del negocio)", () => {
    expect(priceFor({ ...args, rules: [{ ...base, weekdays: [2, 3] }] }).discountCents).toBeGreaterThan(0);
    expect(priceFor({ ...args, rules: [{ ...base, weekdays: [4] }] }).discountCents).toBe(0);
  });

  it("un turno a las 22:30 locales (01:30 UTC del día siguiente) cuenta como el día local", () => {
    const lateTue = new Date("2026-11-25T01:30:00Z"); // martes 24, 22:30 en Argentina
    expect(priceFor({ ...args, startAt: lateTue, rules: [{ ...base, weekdays: [2] }] }).discountCents).toBeGreaterThan(0);
    expect(priceFor({ ...args, startAt: lateTue, rules: [{ ...base, weekdays: [3] }] }).discountCents).toBe(0);
  });

  it("franja horaria: de 10:00 a 12:00", () => {
    const rule = { ...base, startMin: 600, endMin: 720 };
    expect(priceFor({ ...args, rules: [rule] }).discountCents).toBeGreaterThan(0); // 10:00
    expect(priceFor({ ...args, startAt: new Date("2026-11-24T15:00:00Z"), rules: [rule] }).discountCents).toBe(0); // 12:00
  });

  it("vigencia: vencido o futuro no aplica", () => {
    expect(priceFor({ ...args, rules: [{ ...base, endsAt: new Date("2026-11-01T00:00:00Z") }] }).discountCents).toBe(0);
    expect(priceFor({ ...args, rules: [{ ...base, startsAt: new Date("2026-12-01T00:00:00Z") }] }).discountCents).toBe(0);
  });

  it("pausado no aplica", () => {
    expect(priceFor({ ...args, rules: [{ ...base, active: false }] }).discountCents).toBe(0);
  });
});

describe("cupones", () => {
  const coupon = { ...base, id: "c1", couponCode: "FADE10", value: 10 };

  it("un descuento con cupón NO se aplica solo", () => {
    expect(priceFor({ ...args, rules: [coupon] }).discountCents).toBe(0);
  });

  it("con el cupón correcto (sin importar mayúsculas ni espacios) aplica", () => {
    const r = priceFor({ ...args, rules: [coupon], coupon: " fade10 " });
    expect(r.coupon).toBe("ok");
    expect(r.discountCents).toBe(180_000);
    expect(normalizeCoupon(" fa de10 ")).toBe("FADE10");
  });

  it("estados: inválido, vencido, agotado, pausado, no aplica", () => {
    expect(priceFor({ ...args, rules: [coupon], coupon: "NOPE" }).coupon).toBe("invalid");
    expect(priceFor({ ...args, rules: [{ ...coupon, endsAt: new Date("2026-11-01T00:00:00Z") }], coupon: "FADE10" }).coupon).toBe("expired");
    expect(priceFor({ ...args, rules: [{ ...coupon, maxUses: 5, usedCount: 5 }], coupon: "FADE10" }).coupon).toBe("exhausted");
    expect(priceFor({ ...args, rules: [{ ...coupon, active: false }], coupon: "FADE10" }).coupon).toBe("paused");
    expect(priceFor({ ...args, rules: [{ ...coupon, serviceIds: ["otro"] }], coupon: "FADE10" }).coupon).toBe("not_applicable");
  });

  it("no se acumulan: gana la que más descuenta", () => {
    const r = priceFor({ ...args, rules: [base, coupon], coupon: "FADE10" }); // 20% automática vs 10% cupón
    expect(r.discountCents).toBe(360_000);
    expect(r.discount?.id).toBe("d1");
    expect(r.coupon).toBe("ok");
  });
});
