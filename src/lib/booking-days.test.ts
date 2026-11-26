import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { bookableDays, computeStarts, findNextAvailableDay, todayIso } from "./booking-days";

const TZ = "America/Argentina/Buenos_Aires"; // UTC−3
const at = (iso: string) => DateTime.fromISO(iso, { zone: "utc" });
const hours = (...h: number[]) => h.map((x) => x * 60);

describe("carga inicial en HOY", () => {
  it("el primer día ofrecido es hoy (en la zona del negocio) y la fecha inicial coincide", () => {
    const now = at("2026-11-23T14:00:00Z"); // 11:00 en Argentina
    const days = bookableDays(TZ, 30, now);
    expect(days[0].toISODate()).toBe("2026-11-23");
    expect(todayIso(TZ, now)).toBe(days[0].toISODate());
    expect(days).toHaveLength(31);
  });

  it("horarios de hoy: se ofrecen los que todavía no pasaron", () => {
    const now = at("2026-11-23T14:00:00Z"); // 11:00 local
    const day = bookableDays(TZ, 30, now)[0];
    const starts = computeStarts({ day, slotMins: hours(9, 10, 12, 15, 18), now, minNoticeMin: 0 });
    expect(starts.map((ms) => DateTime.fromMillis(ms).setZone(TZ).toFormat("HH:mm"))).toEqual(["12:00", "15:00", "18:00"]);
  });
});

describe("horario nocturno (22:30 hora Argentina)", () => {
  // 22:30 en Argentina = 01:30 UTC del día SIGUIENTE
  const now = at("2026-11-24T01:30:00Z");

  it("«hoy» sigue siendo el 23 (no el 24 de UTC)", () => {
    expect(todayIso(TZ, now)).toBe("2026-11-23");
    expect(bookableDays(TZ, 30, now)[0].toISODate()).toBe("2026-11-23");
  });

  it("no quedan horarios hoy, pero sí mañana", () => {
    const [today, tomorrow] = bookableDays(TZ, 30, now);
    const slotMins = hours(10, 12, 18, 20);
    expect(computeStarts({ day: today, slotMins, now, minNoticeMin: 0 })).toEqual([]);
    expect(computeStarts({ day: tomorrow, slotMins, now, minNoticeMin: 0 })).toHaveLength(4);
  });

  it("un horario a las 23:00 todavía se ofrece a las 22:30", () => {
    const today = bookableDays(TZ, 30, now)[0];
    expect(computeStarts({ day: today, slotMins: [23 * 60], now, minNoticeMin: 0 })).toHaveLength(1);
  });

  it("respeta el aviso mínimo", () => {
    const today = bookableDays(TZ, 30, now)[0];
    expect(computeStarts({ day: today, slotMins: [23 * 60], now, minNoticeMin: 60 })).toEqual([]);
  });
});

describe("día sin horarios y «Ver próximo día disponible»", () => {
  const days = ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26"];

  it("sin horarios cargados no se ofrece nada", () => {
    const now = at("2026-11-23T14:00:00Z");
    expect(computeStarts({ day: bookableDays(TZ, 30, now)[0], slotMins: [], now, minNoticeMin: 0 })).toEqual([]);
  });

  it("salta al primer día siguiente con horarios", async () => {
    const asked: string[] = [];
    const next = await findNextAvailableDay(days, "2026-11-23", async (iso) => {
      asked.push(iso);
      return iso === "2026-11-25" ? ["x"] : [];
    });
    expect(next).toBe("2026-11-25");
    expect(asked).toEqual(["2026-11-24", "2026-11-25"]);
  });

  it("devuelve null si no hay ninguno", async () => {
    expect(await findNextAvailableDay(days, "2026-11-23", async () => [])).toBeNull();
  });
});

describe("turnos ya reservados o bloqueados", () => {
  it("un horario tomado o bloqueado no se ofrece", () => {
    const now = at("2026-11-23T11:00:00Z"); // 08:00 local
    const day = bookableDays(TZ, 30, now)[0];
    const ten = day.plus({ hours: 10 }).toMillis();
    const starts = computeStarts({
      day,
      slotMins: hours(10, 11, 12),
      now,
      minNoticeMin: 0,
      takenMs: new Set([ten]),
      timeOffs: [{ startAt: day.plus({ hours: 12 }).toJSDate(), endAt: day.plus({ hours: 13 }).toJSDate() }],
    });
    expect(starts.map((ms) => DateTime.fromMillis(ms).setZone(TZ).toFormat("HH:mm"))).toEqual(["11:00"]);
  });
});
