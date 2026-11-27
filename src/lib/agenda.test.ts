import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { agendaDays, buildTimeline } from "./agenda";
import { barberColors, BARBER_PALETTE } from "./barber-colors";

const m = (h: number, min = 0) => Date.UTC(2026, 10, 26, h, min);
const appt = (id: string, h: number, barberId = "b1") => ({ id, barberId, startMs: m(h), endMs: m(h) + 45 * 60_000 });

describe("agenda por profesional", () => {
  it("ordena turnos y huecos libres por horario", () => {
    const t = buildTimeline([appt("a", 12), appt("b", 10)], [{ barberId: "b1", startMs: m(11) }], null);
    expect(t.map((i) => (i.kind === "appt" ? i.appt.id : i.kind))).toEqual(["b", "free", "a"]);
  });

  it("no ofrece un hueco que cae dentro de un turno del mismo profesional", () => {
    const t = buildTimeline([appt("a", 10)], [{ barberId: "b1", startMs: m(10, 30) }, { barberId: "b2", startMs: m(10, 30) }], null);
    expect(t.filter((i) => i.kind === "free")).toHaveLength(1); // solo el de b2
  });

  it("intercala la línea de la hora actual antes del primer turno que no empezó", () => {
    const t = buildTimeline([appt("a", 10), appt("b", 15)], [], m(12));
    expect(t.map((i) => i.kind)).toEqual(["appt", "now", "appt"]);
  });

  it("si ya pasaron todos, la línea va al final; sin 'hoy' no hay línea", () => {
    expect(buildTimeline([appt("a", 10)], [], m(20)).at(-1)?.kind).toBe("now");
    expect(buildTimeline([appt("a", 10)], [], null).some((i) => i.kind === "now")).toBe(false);
  });

  it("un turno por tarjeta aunque sea la misma persona (cada uno con su id)", () => {
    const t = buildTimeline([appt("a", 10), appt("b", 11)], [], null);
    expect(new Set(t.map((i) => (i.kind === "appt" ? i.appt.id : ""))).size).toBe(2);
  });

  it("agendaDays empieza hoy en la zona del negocio (22:30 Argentina sigue siendo hoy)", () => {
    const now = DateTime.fromISO("2026-11-24T01:30:00Z", { zone: "utc" }); // 22:30 del 23 en Argentina
    const d = agendaDays("America/Argentina/Buenos_Aires", now);
    expect(d[0]).toBe("2026-11-23");
    expect(d).toHaveLength(7);
  });
});

describe("colores de profesionales", () => {
  it("cada profesional tiene su color y no se repiten mientras haya paleta", () => {
    const c = barberColors([{ id: "c3", color: null }, { id: "c1", color: null }, { id: "c2", color: null }]);
    expect(new Set(c.values()).size).toBe(3);
  });
  it("respeta el color elegido y no se lo da a otro", () => {
    const c = barberColors([{ id: "a", color: BARBER_PALETTE[0] }, { id: "b", color: null }]);
    expect(c.get("a")).toBe(BARBER_PALETTE[0]);
    expect(c.get("b")).not.toBe(BARBER_PALETTE[0]);
  });
  it("es estable: no depende del orden en que llegan", () => {
    const a = barberColors([{ id: "x1", color: null }, { id: "x2", color: null }]);
    const b = barberColors([{ id: "x2", color: null }, { id: "x1", color: null }]);
    expect(a.get("x1")).toBe(b.get("x1"));
  });
});

describe("agenda con bloqueos y otras semanas", () => {
  it("intercala los bloqueos en orden, sin mezclarlos con los libres", () => {
    const t = buildTimeline([], [{ barberId: "b1", startMs: 3000 }, { barberId: "b1", startMs: 1000 }], null, [{ at: 2000 }]);
    expect(t.map((i) => i.kind)).toEqual(["free", "block", "free"]);
  });
  it("a igual hora, el turno va primero y después el bloqueo", () => {
    const t = buildTimeline([{ startMs: 1000, endMs: 2000, barberId: "b1" }], [], null, [{ at: 1000 }]);
    expect(t.map((i) => i.kind)).toEqual(["appt", "block"]);
  });
  it("la semana pedida arranca en esa fecha y nunca antes de hoy", () => {
    const tz = "America/Argentina/Buenos_Aires";
    const now = DateTime.fromISO("2026-11-27T10:00", { zone: tz });
    expect(agendaDays(tz, now, "2026-12-14")[0]).toBe("2026-12-14");
    expect(agendaDays(tz, now, "2026-11-01")[0]).toBe("2026-11-27");
    expect(agendaDays(tz, now, "basura")[0]).toBe("2026-11-27");
    expect(agendaDays(tz, now, "2026-12-14")).toHaveLength(7);
  });
});