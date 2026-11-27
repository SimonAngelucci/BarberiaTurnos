import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { blockFormValues, blockKind, blockLabel, expandBlock, findConflicts, groupBlocks, type BlockSpec } from "./blocks";
import { computeStarts } from "./booking-days";

const TZ = "America/Argentina/Buenos_Aires";
const NOW = DateTime.fromISO("2026-11-27T09:00", { zone: TZ });
const SLOTS = [10 * 60, 11 * 60, 13 * 60, 14 * 60, 16 * 60 + 30]; // 10:00 11:00 13:00 14:00 16:30
const spec = (o: Partial<BlockSpec>): BlockSpec => ({ barberId: null, dateFrom: "2026-11-27", allDay: false, ...o });
const day = (iso: string) => DateTime.fromISO(iso, { zone: TZ }).startOf("day");
const hhmm = (ms: number) => DateTime.fromMillis(ms).setZone(TZ).toFormat("HH:mm");
/** Horarios que ve el cliente un día dado, con los bloqueos de ese profesional (o del negocio). */
function offered(date: string, blocks: { barberId: string | null; i: { startAt: Date; endAt: Date } }[], barberId = "b1") {
  return computeStarts({ day: day(date), slotMins: SLOTS, now: NOW, minNoticeMin: 0, timeOffs: blocks.filter((b) => b.barberId === barberId || b.barberId === null).map((b) => b.i) }).map(hhmm);
}
const blocksOf = (s: BlockSpec) => expandBlock(s, TZ, NOW).map((i) => ({ barberId: s.barberId, i }));

describe("bloquear horarios", () => {
  it("un horario de hoy desaparece, los demás quedan", () => {
    const b = blocksOf(spec({ barberId: "b1", timeFrom: "16:30" }));
    expect(offered("2026-11-27", b)).toEqual(["10:00", "11:00", "13:00", "14:00"]);
  });
  it("un horario de otra semana solo afecta esa fecha", () => {
    const b = blocksOf(spec({ barberId: "b1", dateFrom: "2026-12-09", timeFrom: "11:00" }));
    expect(offered("2026-12-09", b)).not.toContain("11:00");
    expect(offered("2026-12-16", b)).toContain("11:00");
    expect(offered("2026-12-02", b)).toContain("11:00");
  });
  it("desbloquear (sin el bloqueo) vuelve a ofrecer el horario", () => {
    expect(offered("2026-11-27", [])).toContain("16:30");
  });
  it("por profesional: los otros siguen disponibles", () => {
    const b = blocksOf(spec({ barberId: "b1", timeFrom: "10:00" }));
    expect(offered("2026-11-27", b, "b1")).not.toContain("10:00");
    expect(offered("2026-11-27", b, "b2")).toContain("10:00");
  });
  it("todo el negocio afecta a todos", () => {
    const b = blocksOf(spec({ barberId: null, timeFrom: "10:00" }));
    expect(offered("2026-11-27", b, "b2")).not.toContain("10:00");
  });
  it("un rango de horas oculta los que arrancan adentro (13:00 a 15:00 → 13:00 y 14:00)", () => {
    const b = blocksOf(spec({ barberId: "b1", dateFrom: "2026-12-04", timeFrom: "13:00", timeTo: "15:00" }));
    expect(offered("2026-12-04", b)).toEqual(["10:00", "11:00", "16:30"]);
  });
  it("día completo", () => {
    const b = blocksOf(spec({ barberId: "b1", dateFrom: "2026-12-13", allDay: true }));
    expect(offered("2026-12-13", b)).toEqual([]);
    expect(offered("2026-12-12", b)).toHaveLength(5);
    expect(offered("2026-12-14", b)).toHaveLength(5);
  });
  it("varios días seguidos (22/12 al 26/12) incluye el último día entero", () => {
    const b = blocksOf(spec({ dateFrom: "2026-12-22", dateTo: "2026-12-26", allDay: true }));
    expect(b).toHaveLength(1);
    for (const d of ["2026-12-22", "2026-12-24", "2026-12-26"]) expect(offered(d, b)).toEqual([]);
    expect(offered("2026-12-21", b)).toHaveLength(5);
    expect(offered("2026-12-27", b)).toHaveLength(5);
  });
  it("varios días con horas: una ocurrencia por día", () => {
    const b = blocksOf(spec({ dateFrom: "2026-12-01", dateTo: "2026-12-03", timeFrom: "13:00", timeTo: "15:00" }));
    expect(b).toHaveLength(3);
    expect(offered("2026-12-02", b)).toEqual(["10:00", "11:00", "16:30"]);
    expect(offered("2026-12-04", b)).toHaveLength(5);
  });
  it("repetición: todos los miércoles de 13 a 14 hasta fin de mes", () => {
    const b = blocksOf(spec({ barberId: "b1", dateFrom: "2026-12-02", timeFrom: "13:00", timeTo: "14:00", repeatUntil: "2026-12-31" }));
    expect(b).toHaveLength(5); // 2, 9, 16, 23 y 30 de diciembre
    expect(offered("2026-12-23", b)).not.toContain("13:00");
    expect(offered("2026-12-23", b)).toContain("14:00"); // el fin es exclusivo
    expect(offered("2026-12-24", b)).toContain("13:00");
  });
  it("las horas son del negocio: 22:30 en Argentina no corre de día", () => {
    const b = blocksOf(spec({ dateFrom: "2026-12-05", timeFrom: "22:30" }));
    expect(DateTime.fromJSDate(b[0].i.startAt).setZone(TZ).toISODate()).toBe("2026-12-05");
  });
});

describe("validaciones", () => {
  it("rechaza datos incoherentes", () => {
    expect(() => expandBlock(spec({ timeFrom: "15:00", timeTo: "13:00" }), TZ, NOW)).toThrow(/posterior/);
    expect(() => expandBlock(spec({ dateFrom: "2026-12-05", dateTo: "2026-12-01", allDay: true }), TZ, NOW)).toThrow(/anterior/);
    expect(() => expandBlock(spec({ timeFrom: null }), TZ, NOW)).toThrow(/hora/);
    expect(() => expandBlock(spec({ dateFrom: "2026-12-05", dateTo: "2026-12-07", allDay: true, repeatUntil: "2026-12-31" }), TZ, NOW)).toThrow(/un solo día/);
    expect(() => expandBlock(spec({ dateFrom: "2026-11-01", timeFrom: "10:00" }), TZ, NOW)).toThrow(/pasó/);
  });
});

describe("cómo se muestra", () => {
  const one = (s: BlockSpec) => expandBlock(s, TZ, NOW)[0];
  it("clasifica y rotula", () => {
    const a = one(spec({ timeFrom: "16:30" }));
    expect([blockKind(a.startAt, a.endAt, TZ), blockLabel(a.startAt, a.endAt, TZ)]).toEqual(["slot", "16:30"]);
    const r = one(spec({ dateFrom: "2026-12-04", timeFrom: "13:00", timeTo: "15:00" }));
    expect([blockKind(r.startAt, r.endAt, TZ), blockLabel(r.startAt, r.endAt, TZ)]).toEqual(["range", "13:00 a 15:00"]);
    const d = one(spec({ dateFrom: "2026-12-13", allDay: true }));
    expect([blockKind(d.startAt, d.endAt, TZ), blockLabel(d.startAt, d.endAt, TZ)]).toEqual(["allday", "Todo el día"]);
    const v = one(spec({ dateFrom: "2026-12-22", dateTo: "2026-12-26", allDay: true }));
    expect(blockLabel(v.startAt, v.endAt, TZ)).toBe("Del 22/12 al 26/12");
  });
});

describe("turnos ya reservados", () => {
  const at = (iso: string) => DateTime.fromISO(iso, { zone: TZ }).toJSDate();
  const appts = [
    { id: "x", barberId: "b1", startAt: at("2026-12-04T13:00") },
    { id: "y", barberId: "b2", startAt: at("2026-12-04T13:30") },
    { id: "z", barberId: "b1", startAt: at("2026-12-04T15:00") },
  ];
  const iv = expandBlock(spec({ dateFrom: "2026-12-04", timeFrom: "13:00", timeTo: "15:00" }), TZ, NOW);
  it("detecta los de ese profesional dentro del rango (el fin es exclusivo)", () => {
    expect(findConflicts(appts, iv, "b1").map((a) => a.id)).toEqual(["x"]);
  });
  it("todo el negocio detecta los de todos", () => {
    expect(findConflicts(appts, iv, null).map((a) => a.id)).toEqual(["x", "y"]);
  });
});

describe("series y edici�n", () => {
  const rows = (s: BlockSpec, groupId: string | null) => expandBlock(s, TZ, NOW).map((i, n) => ({ id: `${groupId ?? "s"}-${n}`, barberId: s.barberId, startAt: i.startAt, endAt: i.endAt, reason: "almuerzo", groupId }));
  it("junta una repetici�n semanal en una sola tarjeta y la edita como serie", () => {
    const g = groupBlocks(rows(spec({ barberId: "b1", dateFrom: "2026-12-02", timeFrom: "13:00", timeTo: "14:00", repeatUntil: "2026-12-30" }), "g1"));
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ count: 5, pattern: "weekly" });
    expect(blockFormValues(g[0], TZ)).toMatchObject({ dateFrom: "2026-12-02", dateTo: "", repeatUntil: "2026-12-30", timeFrom: "13:00", timeTo: "14:00", allDay: false, barberId: "b1" });
  });
  it("varios d�as con horas = serie diaria; varios d�as corridos = una sola tarjeta", () => {
    const d = groupBlocks(rows(spec({ dateFrom: "2026-12-01", dateTo: "2026-12-03", timeFrom: "13:00", timeTo: "15:00" }), "g2"));
    expect(d[0]).toMatchObject({ count: 3, pattern: "daily" });
    expect(blockFormValues(d[0], TZ)).toMatchObject({ dateFrom: "2026-12-01", dateTo: "2026-12-03", repeatUntil: "" });
    const v = groupBlocks(rows(spec({ dateFrom: "2026-12-22", dateTo: "2026-12-26", allDay: true }), null));
    expect(v[0]).toMatchObject({ count: 1, pattern: "single" });
    expect(blockFormValues(v[0], TZ)).toMatchObject({ allDay: true, dateFrom: "2026-12-22", dateTo: "2026-12-26" });
  });
  it("ordena por fecha y deja sueltos los bloqueos sin serie", () => {
    const a = rows(spec({ dateFrom: "2026-12-10", timeFrom: "10:00" }), null);
    const b = rows(spec({ dateFrom: "2026-12-05", timeFrom: "10:00" }), null).map((x) => ({ ...x, id: "otro" }));
    expect(groupBlocks([...a, ...b]).map((c) => c.id)).toEqual(["otro", "s-0"]);
  });
});
