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
  it("suggests the last used live account and workspace", () => {
    const s = smartDefaults([{ date: "2026-10-01", accountId: "old", scope: "business" }, { date: "2026-10-02", accountId: "gone", scope: "family" }], ["old"]);
    expect(s).toEqual({ accountId: "old", scope: "family" });
  });
});
