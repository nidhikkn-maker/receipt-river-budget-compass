import { describe, expect, it } from "vitest";
import { quickEntrySearch } from "./quick-entry";
describe("Shortcut drafts", () => {
  it("accepts valid shortcut fields without a save action", () => expect(quickEntrySearch({amount:"2500",currency:"inr",title:"Dinner",payment:"credit_card",scope:"business",date:"2026-10-31"})).toEqual({amount:2500,currency:"INR",title:"Dinner",payment:"credit_card",scope:"business",date:"2026-10-31"}));
  it("rejects invalid amounts, dates and payment modes", () => expect(quickEntrySearch({amount:-1,date:"2026-02-30",payment:"fake",currency:"ZZZ"})).toEqual({}));
  it("limits incoming shared text",()=>expect(quickEntrySearch({text:"x".repeat(1000)}).text?.length).toBe(500));
  it.each(['scan', 'voice', 'quick', 'message'])('accepts %s as a draft-only starting mode', mode => expect(quickEntrySearch({ mode, scope: 'business', save: true, approved: true })).toEqual({ mode, scope: 'business' }));
  it('rejects forged modes and workspace authority', () => expect(quickEntrySearch({ mode: 'post', scope: 'other-owner', ownerId: 'other', account: 'candidate' })).toEqual({ account: 'candidate' }));
});