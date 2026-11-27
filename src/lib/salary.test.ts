import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { addDays, biweeklyAnchor, computeSalary, currentPeriod, firstPeriodStart, lastPayDate, leftText, nextPayDate, periodState, ruleFor, type Rule, type SalaryAppt } from "./salary";

const TZ = "America/Argentina/Buenos_Aires";
const rule = (o: Partial<Rule> = {}): Rule => ({ effectiveFrom: "2026-11-23", percentBp: 5000, baseCents: 0, serviceRates: {}, frequency: "WEEKLY", payDay: 6, anchorDate: null, ...o });
const at = (iso: string) => DateTime.fromISO(iso, { zone: TZ }).toJSDate();
const appt = (id: string, start: string, price: number, status = "COMPLETED", serviceId = "s1"): SalaryAppt => ({ id, startAt: at(start), endAt: at(start).constructor === Date ? new Date(at(start).getTime() + 30 * 60_000) : at(start), status, priceCents: price, serviceId });

describe("fechas de pago", () => {
  it("semanal: sábado 29/11/2026 y el día de pago cuenta como hoy", () => {
    expect(nextPayDate("2026-11-26", rule())).toBe("2026-11-28"); // el sábado de esa semana
    expect(nextPayDate("2026-11-28", rule())).toBe("2026-11-28");
    expect(lastPayDate("2026-11-27", rule())).toBe("2026-11-21");
  });
  it("mensual: día 31 = último día y febrero", () => {
    const r = rule({ frequency: "MONTHLY", payDay: 31 });
    expect(nextPayDate("2026-02-10", r)).toBe("2026-02-28");
    expect(nextPayDate("2026-11-01", r)).toBe("2026-11-30");
    expect(lastPayDate("2026-03-05", r)).toBe("2026-02-28");
  });
  it("quincenal: cada 14 días desde el ancla", () => {
    const anchor = biweeklyAnchor("2026-11-26", 6);
    expect(anchor).toBe("2026-11-28");
    const r = rule({ frequency: "BIWEEKLY", anchorDate: anchor });
    expect(nextPayDate("2026-11-29", r)).toBe("2026-12-12");
    expect(lastPayDate("2026-11-27", r)).toBe("2026-11-14");
  });
  it("primer período: arranca el día después del último pago programado", () => {
    expect(firstPeriodStart("2026-11-26", rule())).toBe("2026-11-22");
    expect(firstPeriodStart("2026-11-28", rule())).toBe("2026-11-22"); // hoy es día de pago: el período incluye hoy
  });
});

describe("período en curso", () => {
  it("sin pagos arranca en la primera regla; con un pago sigue el día siguiente", () => {
    const r = rule({ effectiveFrom: "2026-11-22" });
    expect(currentPeriod([r], null)).toMatchObject({ start: "2026-11-22", end: "2026-11-28" });
    expect(currentPeriod([r], "2026-11-28")).toMatchObject({ start: "2026-11-29", end: "2026-12-05" });
  });
  it("un cambio programado rige recién desde el período siguiente", () => {
    const old = rule({ effectiveFrom: "2026-11-22", percentBp: 4000 });
    const next = rule({ effectiveFrom: "2026-11-29", percentBp: 6000 });
    expect(currentPeriod([old, next], null)!.rule.percentBp).toBe(4000);
    expect(currentPeriod([old, next], "2026-11-28")!.rule.percentBp).toBe(6000);
    expect(ruleFor([old, next], "2026-11-28")!.percentBp).toBe(4000);
  });
  it("sin reglas no hay período", () => {
    expect(currentPeriod([], null)).toBeNull();
  });
});

describe("cálculo", () => {
  const r = rule({ percentBp: 5000, baseCents: 100_000, serviceRates: { s2: 3000 } });
  const from = "2026-11-23";
  const to = "2026-11-29";
  const now = at("2026-11-30T10:00");

  it("usa el precio final, el % por servicio y suma el fijo", () => {
    const c = computeSalary({
      rule: r,
      from,
      to,
      tz: TZ,
      now,
      appts: [appt("a", "2026-11-24T10:00", 800_000), appt("b", "2026-11-25T11:00", 1_000_000, "COMPLETED", "s2")],
    });
    expect(c.count).toBe(2);
    expect(c.billedCents).toBe(1_800_000);
    expect(c.commissionCents).toBe(400_000 + 300_000);
    expect(c.totalCents).toBe(800_000);
  });
  it("excluye cancelados, ausentes y los que no se hicieron todavía", () => {
    const c = computeSalary({
      rule: r,
      from,
      to,
      tz: TZ,
      now: at("2026-11-26T12:00"),
      appts: [appt("a", "2026-11-24T10:00", 500_000), appt("b", "2026-11-24T12:00", 500_000, "CANCELLED"), appt("c", "2026-11-24T13:00", 500_000, "NO_SHOW"), appt("d", "2026-11-28T10:00", 500_000, "CONFIRMED")],
    });
    expect(c.count).toBe(1);
  });
  it("un turno a las 22:30 del último día cuenta en ese día, no en el siguiente", () => {
    const c = computeSalary({ rule: r, from, to, tz: TZ, now, appts: [appt("late", "2026-11-29T22:30", 100_000), appt("next", "2026-11-30T00:30", 100_000)] });
    expect(c.items.map((i) => i.id)).toEqual(["late"]);
  });
  it("redondea la comisión", () => {
    const c = computeSalary({ rule: rule({ percentBp: 3333 }), from, to, tz: TZ, now, appts: [appt("a", "2026-11-24T10:00", 100_001)] });
    expect(c.commissionCents).toBe(Math.round((100_001 * 3333) / 10_000));
  });
});

describe("estado del período", () => {
  it("avance, días que faltan y aviso amarillo con 2 días o menos", () => {
    expect(periodState("2026-11-23", "2026-11-29", "2026-11-26")).toMatchObject({ totalDays: 7, elapsedDays: 4, daysLeft: 3, soon: false, overdue: false });
    expect(periodState("2026-11-23", "2026-11-29", "2026-11-27").soon).toBe(true);
    expect(periodState("2026-11-23", "2026-11-29", "2026-11-29")).toMatchObject({ daysLeft: 0, soon: true });
    expect(periodState("2026-11-23", "2026-11-29", "2026-12-01")).toMatchObject({ overdue: true, soon: false });
  });
  it("textos", () => {
    expect(leftText(3)).toBe("faltan 3 días");
    expect(leftText(1)).toBe("mañana");
    expect(leftText(0)).toBe("hoy");
    expect(leftText(-2)).toBe("atrasado 2 días");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});
