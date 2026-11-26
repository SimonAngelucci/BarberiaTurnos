import { describe, expect, it } from "vitest";
import { phoneKey, phoneVariants } from "./phone-key";

describe("una persona con dos turnos es un solo cliente", () => {
  it("el mismo celular escrito con y sin el 9 da la misma clave", () => {
    expect(phoneKey("+5492473506255")).toBe(phoneKey("+542473506255"));
    expect(phoneKey("+54 9 2473 50-6255")).toBe(phoneKey("+54 2473 506255"));
  });

  it("personas distintas con el mismo nombre NO se mezclan (la clave es el teléfono)", () => {
    expect(phoneKey("+5492473506255")).not.toBe(phoneKey("+5492473515569"));
  });

  it("el cliente existente se busca con las dos formas del número", () => {
    expect(phoneVariants("+5492473506255")).toEqual(["+5492473506255", "+542473506255"]);
    expect(phoneVariants("+542473506255")).toEqual(["+542473506255", "+5492473506255"]);
  });

  it("otros países no se tocan", () => {
    expect(phoneVariants("+59899123456")).toEqual(["+59899123456"]);
    expect(phoneKey("+59899123456")).toBe("59899123456");
  });

  it("dos turnos de la misma persona se agrupan en una sola entrada con 2 turnos", () => {
    const appts = [
      { id: "a1", phone: "+5492473506255", customer: "Simón Angelucci" },
      { id: "a2", phone: "+542473506255", customer: "Simón Angelucci" },
      { id: "a3", phone: "+5492473515569", customer: "Simón Angelucci" }, // otra persona, mismo nombre
    ];
    const m = new Map<string, number>();
    for (const a of appts) m.set(phoneKey(a.phone), (m.get(phoneKey(a.phone)) ?? 0) + 1);
    expect([...m.values()].sort()).toEqual([1, 2]);
    expect(new Set(appts.map((a) => a.id)).size).toBe(3); // cada turno conserva su propio id (key de la tarjeta)
  });
});
