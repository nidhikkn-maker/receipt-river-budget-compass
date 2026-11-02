import { describe, expect, it } from "vitest";
import { copyItem, itineraryConflicts, itineraryDays, outsideTrip, tripReadiness } from "./trip-itinerary";
import type { ItineraryItem, TravelTrip } from "./travel";

const i = (id: string, date: string, time?: string, travellers?: string[]): ItineraryItem => ({ id, date, title: id, ...(time ? { time } : {}), ...(travellers ? { travellers } : {}) });

describe("trip itinerary", () => {
  it("groups by day in time order", () => {
    const d = itineraryDays([i("b", "2026-05-02", "09:00"), i("a", "2026-05-01"), i("c", "2026-05-02", "08:00")]);
    expect(d.map((x) => x.date)).toEqual(["2026-05-01", "2026-05-02"]);
    expect(d[1].items.map((x) => x.id)).toEqual(["c", "b"]);
  });
  it("flags same-time clashes only for shared travellers", () => {
    expect([...itineraryConflicts([i("a", "2026-05-01", "09:00", ["KK"]), i("b", "2026-05-01", "09:00", ["KK"])])].sort()).toEqual(["a", "b"]);
    expect(itineraryConflicts([i("a", "2026-05-01", "09:00", ["KK"]), i("b", "2026-05-01", "09:00", ["Wife"])]).size).toBe(0);
    expect(itineraryConflicts([i("a", "2026-05-01"), i("b", "2026-05-01")]).size).toBe(0);
  });
  it("flags items outside trip dates", () => {
    expect([...outsideTrip({ start: "2026-05-01", end: "2026-05-03" }, [i("a", "2026-04-30"), i("b", "2026-05-02")])]).toEqual(["a"]);
  });
  it("copies with a new id and date", () => {
    const c = copyItem(i("a", "2026-05-01"), "2026-05-02", "z");
    expect(c).toMatchObject({ id: "z", date: "2026-05-02", title: "a" });
  });
  it("readiness counts saved data", () => {
    const r = tripReadiness({ id: "t", name: "T", start: "2026-05-01", end: "2026-05-03", budget: 0, destination: "Goa" } as TravelTrip);
    expect(r.done).toBe(2);
    expect(r.missing).toContain("Set a budget");
  });
});
