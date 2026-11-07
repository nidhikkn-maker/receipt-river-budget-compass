import { describe, expect, it } from "vitest";
import { normalizeNotificationSettings } from "./notification-settings";
import { paymentReminderItems, reminderBatches } from "./push-rules";
import { normalizePreferences } from "./preferences";

describe("Phone reminder configuration", () => {
  it("defaults every existing reminder type on without overwriting a saved off choice", () => {
    expect(normalizeNotificationSettings({ loanFunding: false })).toEqual({ loanFunding: false, payments: true, documents: true, trips: true, checkIns: true, depreciation: true });
    expect(normalizePreferences({notifications:{...normalizeNotificationSettings(),documents:false}}).notifications?.documents).toBe(false);
  });
  it("disabled document and trip types never enter the phone queue", () => {
    expect(paymentReminderItems({today:"2026-11-04",leadDays:3,enabled:true,commitments:[],loans:[],accounts:[],transactions:[],documents:[{id:"doc",expiresOn:"2026-11-05"}],trips:[{id:"trip",itinerary:[{id:"plan",date:"2026-11-05"}]}],notifications:{documents:false,trips:false}})).toEqual([]);
  });
  it("a funding warning has a distinct claim from a previously sent payment reminder", () => {
    const batches=reminderBatches([{key:"loan:gls:2026-11-05",date:"2026-11-05",kind:"payment"},{key:"loan-funding:gls:2026-11-05",date:"2026-11-05",kind:"loanFunding"}],"phone");
    expect(batches.map(b=>b.key)).toEqual(["device:phone","device:phone:loan-funding"]);
    expect(batches[1]?.payload.url).toBe("/plan");
    expect(batches[1]?.payload.body).not.toContain("GLS");
    expect(batches[1]?.payload.body).not.toContain("313913");
  });
});