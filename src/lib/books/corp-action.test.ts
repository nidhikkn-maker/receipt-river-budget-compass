import { describe, it, expect } from "vitest";
import { applyCorporateAction } from "./market";
describe("corporate actions", () => {
  it("1:1 bonus doubles shares, keeps cost", () => {
    expect(applyCorporateAction({ quantity: 100, cost: 50000 }, { kind: "bonus", ratioNew: 1, ratioOld: 1 })).toEqual({ quantity: 200, cost: 50000, unitCost: 250 });
  });
  it("split 10 to 2 face value gives 5x shares", () => {
    expect(applyCorporateAction({ quantity: 10, cost: 1000 }, { kind: "split", ratioNew: 2, ratioOld: 10 }).quantity).toBe(50);
  });
});
