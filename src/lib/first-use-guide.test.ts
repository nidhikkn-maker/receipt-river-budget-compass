import { describe, expect, it } from "vitest";
import { JOURNEYS, journeysFor, MANAGE_CHOICES } from "./first-use-guide";

describe("first-use guide", () => {
  it("covers the six everyday situations, each with exactly one next action", () => {
    expect(JOURNEYS.map(j => j.key)).toEqual(["receipt", "transfer", "card_payment", "statement", "asset", "reimbursement"]);
    for (const j of JOURNEYS) expect(j.next.label.length).toBeGreaterThan(0);
  });
  it("offers My money, Family and Business", () => expect(MANAGE_CHOICES.map(c => c.title)).toEqual(["My money", "Family", "Business"]));
  it("explains that own-account moves and card bill payments are not spending", () => {
    expect(JOURNEYS.find(j => j.key === "transfer")!.ledgerlineSays).toContain("isn't spending");
    expect(JOURNEYS.find(j => j.key === "card_payment")!.safeguard).toContain("one payment, not two expenses");
  });
  it("shows no sample money figures", () => {
    for (const j of JOURNEYS) expect(`${j.situation} ${j.ledgerlineSays} ${j.youDo} ${j.safeguard}`).not.toMatch(/₹|\d/);
  });
  it("family view hides the card and asset journeys", () => expect(journeysFor("family").map(j => j.key)).toEqual(["receipt", "transfer", "statement"]));
});
