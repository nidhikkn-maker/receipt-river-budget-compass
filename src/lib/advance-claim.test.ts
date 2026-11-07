import { describe, it, expect } from "vitest";
import { applyAdvance, type Claim } from "./expense-claim";
const claim = { totals: { eligible: 5000, received: 0, claimed: 5000 } } as Claim;
describe("advance applied to a claim (user chooses each time)", () => {
  it("deducts exactly the amount the user enters", () => {
    expect(applyAdvance(claim, 2000, 3000).totals).toMatchObject({ advanceApplied: 2000, payable: 3000 });
  });
  it("allows applying none of the advance", () => { expect(applyAdvance(claim, 0, 3000).totals.payable).toBe(5000); });
  it("refuses more than the unapplied advance", () => { expect(() => applyAdvance(claim, 3500, 3000)).toThrow(); });
  it("refuses more than the claimed amount", () => { expect(() => applyAdvance(claim, 6000, 9000)).toThrow(); });
  it("refuses negative amounts", () => { expect(() => applyAdvance(claim, -1, 3000)).toThrow(); });
});
