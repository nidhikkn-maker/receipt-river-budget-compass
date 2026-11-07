import { describe, expect, it } from "vitest";
import { confirmedReceiptDraft, matchDraftsToLines, type MatchableDraft } from "./draft-match";
import type { StmtLine } from "./line";

const line = (key: string, amount: number, date: string, description: string, direction: "debit" | "credit" = "debit"): StmtLine => ({ key, file: "f", date, amount, direction, balance: null, description, currency: "INR" });
const draft = (id: string, amount: number, date: string, merchant: string, extra: Partial<MatchableDraft["data"]> = {}): MatchableDraft => ({ id, status: "ready", receipts: [{ name: "r.jpg", type: "image/jpeg", path: "p" }], data: { amount: String(amount), date, merchant, currency: "INR", ...extra } });

describe("Matching confirmed receipt drafts to bank lines", () => {
  it("exact amount, close date and shop in narration is a sure match", () => {
    const m = matchDraftsToLines([line("a", 2265, "2026-11-02", "UPI/CREAM CENTRE/123")], [draft("d", 2265, "2026-11-01", "Cream Centre")]);
    expect(m).toMatchObject([{ lineKey: "a", draftId: "d", certainty: "sure" }]);
  });
  it("a small amount gap or unnamed shop goes to review", () => {
    expect(matchDraftsToLines([line("a", 2300, "2026-11-01", "CREAM CENTRE")], [draft("d", 2265, "2026-11-01", "Cream Centre")])[0]?.certainty).toBe("check");
    expect(matchDraftsToLines([line("a", 2265, "2026-11-01", "POS 4411")], [draft("d", 2265, "2026-11-01", "Cream Centre")])[0]?.certainty).toBe("check");
  });
  it("two equal bank lines for one receipt are never auto-matched, and only one pairs", () => {
    const m = matchDraftsToLines([line("a", 500, "2026-11-01", "CREAM CENTRE"), line("b", 500, "2026-11-01", "CREAM CENTRE")], [draft("d", 500, "2026-11-01", "Cream Centre")]);
    expect(m).toHaveLength(1);
    expect(m[0]?.certainty).toBe("check");
  });
  it("ignores far dates, big gaps, credits, unconfirmed and saved drafts", () => {
    expect(matchDraftsToLines([line("a", 2265, "2026-11-09", "CREAM CENTRE")], [draft("d", 2265, "2026-11-01", "Cream Centre")])).toEqual([]);
    expect(matchDraftsToLines([line("a", 2500, "2026-11-01", "CREAM CENTRE")], [draft("d", 2265, "2026-11-01", "Cream Centre")])).toEqual([]);
    expect(matchDraftsToLines([line("a", 2265, "2026-11-01", "CREAM CENTRE", "credit")], [draft("d", 2265, "2026-11-01", "Cream Centre")])).toEqual([]);
    expect(confirmedReceiptDraft(draft("d", 1, "2026-11-01", "x", { scan: { merchant: "x", date: "2026-11-01", amount: "1", currency: "INR" } }))).toBe(false);
    expect(confirmedReceiptDraft({ ...draft("d", 1, "2026-11-01", "x"), status: "saved" })).toBe(false);
  });
});
