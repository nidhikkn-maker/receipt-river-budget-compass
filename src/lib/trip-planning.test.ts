import { expect, it } from "vitest";
import { tripAllocationPlans, validatePlanAmount } from "./trip-planning";
import type { TravelTrip } from "./travel";
it("compares workspace and traveller plans to one ledger spend and converts only planning currency amounts", () => {
  const t: TravelTrip = { id: "t", name: "Goa", destination: "Goa", start: "2026-12-01", end: "2026-12-05", budget: 60000, currencies: ["INR"], workspaceBudgets: [{ workspace: "business", amount: 40000 }], travellerBudgets: [{ traveller: "Me", amount: 40000 }], currencyBudgets: [{ currency: "USD", amount: 100, planningRate: 80 }] };
  const e = { id: "e", amount: 60000, originalAmount: 60000, date: "2026-12-02", title: "Hotel", merchant: null, category: "Hotels", tags: ["Trip: Goa"], scope: "business" as const, splits: [{ memberId: null, amount: 36000 }, { memberId: "m", amount: 24000 }] };
  const result = tripAllocationPlans(t, [e]);
  expect(result.workspace[0]).toMatchObject({ budget: 40000, actual: 60000, left: -20000 });
  expect(result.traveller[0]).toMatchObject({ budget: 40000, actual: 36000, left: 4000 });
  expect(result.currencies[0]?.inr).toBe(8000);
  expect(e.amount).toBe(60000);
});
it("rejects nonfinite or nonpositive plan amounts and planning rates", () => {
  expect(() => validatePlanAmount(-1)).toThrow();
  expect(() => validatePlanAmount(100, 0)).toThrow();
  expect(() => validatePlanAmount(Infinity)).toThrow();
});