import { describe, expect, it } from "vitest";
import { repeatCandidates, repeatDraft, smartDefaults } from "./entry-form";

const base = { title: "Dinner", merchant: "Toit", category: "Food", scope: "personal" as const, originalAmount: 3500, currency: "INR", accountId: "amex", paymentMethod: "card", tags: ["Purpose: Family"], description: "dinner", txnType: "expense" as const };

describe("repeat expense", () => {
  it("creates a draft dated today with no id and no reimbursement state", () => {
    const d = repeatDraft({ ...base, id: "old", date: "2026-10-01" }, [], "2026-10-31");
    expect(d.date).toBe("2026-10-31");
    expect("id" in d).toBe(false);
    expect("reimbursementStatus" in d).toBe(false);
    expect(d.suggestedAmount).toBe(3500);
  });
  it("drops a trip link once the trip has ended", () => {
    const trips = [{ id: "t1", name: "Jakarta", start: "2026-09-01", end: "2026-09-05" }];
    const d = repeatDraft({ ...base, id: "x", date: "2026-09-02", tripId: "t1", tags: ["trip:jakarta", "Purpose: Family"] }, trips, "2026-10-31");
    expect(d.tripId).toBe("none");
    expect(d.tags).toEqual(["Purpose: Family"]);
  });
  it("keeps the trip while it is still running", () => {
    const trips = [{ id: "t1", name: "Jakarta", start: "2026-10-30", end: "2026-11-05" }];
    expect(repeatDraft({ ...base, id: "x", date: "2026-10-30", tripId: "t1" }, trips, "2026-10-31").tripId).toBe("t1");
  });
  it("lists favourites first and skips non-expense types", () => {
    const h = [
      { ...base, id: "a", date: "2026-10-01" },
      { ...base, id: "b", date: "2026-10-20", merchant: "Shell" },
      { ...base, id: "c", date: "2026-10-25", merchant: "Card", txnType: "card_payment" as const },
    ];
    const r = repeatCandidates(h, ["a"]);
    expect(r.favourites.map((e) => e.id)).toEqual(["a"]);
    expect(r.recent.map((e) => e.id)).toEqual(["b"]);
  });
  it("never suggests a closed account", () => {
    const s = smartDefaults([{ date: "2026-10-01", accountId: "old", scope: "business" }, { date: "2026-10-02", accountId: "gone", scope: "family" }], ["old"]);
    expect(s.accountId).toBe("old");
  });
  it("picks the usual category, account, workspace and payment method, favouring recent entries", () => {
    const h = [
      { date: "2026-10-05", category: "Food", accountId: "hdfc", scope: "personal" as const, paymentMethod: "upi" },
      { date: "2026-10-04", category: "Food", accountId: "hdfc", scope: "personal" as const, paymentMethod: "upi" },
      { date: "2026-10-03", category: "Fuel", accountId: "amex", scope: "business" as const, paymentMethod: "card" },
      { date: "2026-10-02", category: "Fuel", accountId: "amex", scope: "business" as const, paymentMethod: "card" },
      { date: "2026-10-01", category: "Fuel", accountId: "amex", scope: "business" as const, paymentMethod: "card" },
    ];
    // Three older Fuel entries (0.81 + 0.73 + 0.66 ≈ 2.2) outweigh two newer Food ones (1 + 0.9 = 1.9).
    expect(smartDefaults(h, ["hdfc", "amex"])).toMatchObject({ category: "Fuel", accountId: "amex", scope: "business", paymentMethod: "card", basis: "habit" });
    expect(smartDefaults(h.slice(0, 4), ["hdfc", "amex"])).toMatchObject({ category: "Food", accountId: "hdfc", scope: "personal" });
  });
  it("uses that merchant's own history when the merchant is known", () => {
    const h = [
      { date: "2026-10-05", category: "Food", accountId: "hdfc", scope: "personal" as const, merchant: "Swiggy" },
      { date: "2026-10-01", category: "Fuel", accountId: "amex", scope: "business" as const, merchant: "Indian Oil" },
    ];
    expect(smartDefaults(h, ["hdfc", "amex"], { merchant: " indian oil " })).toMatchObject({ category: "Fuel", accountId: "amex", scope: "business", basis: "merchant", merchant: "Indian Oil" });
    expect(smartDefaults(h, ["hdfc", "amex"], { merchant: "New shop" })).toMatchObject({ category: "Food", basis: "habit" });
  });
  it("skips archived categories and retired workspaces, and only counts expenses", () => {
    const h = [
      { date: "2026-10-05", category: "Old", scope: "official" as const },
      { date: "2026-10-04", category: "Salary", scope: "personal" as const, txnType: "income" as const },
      { date: "2026-10-03", category: "Food", scope: "family" as const },
    ];
    expect(smartDefaults(h, [], { categories: ["Food", "Salary"], scopes: ["personal", "family", "business"] })).toMatchObject({ category: "Food", scope: "family" });
    expect(smartDefaults([], []).basis).toBeNull();
  });
});
