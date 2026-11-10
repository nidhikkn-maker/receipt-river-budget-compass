// P0-004 sweep (drafts.ts): a failed read of an account draft is an error, never "no draft".
// Before the fix getDraft ignored the error and returned null, so (1) opening a draft said it was "no longer available",
// (2) device sync treated the account copy as missing and could overwrite a newer or already-saved draft, and
// (3) the Drafts report silently left out account drafts.
import { beforeEach, describe, expect, it, vi } from "vitest";

const net = vi.hoisted(() => ({ fail: true, upserts: [] as unknown[], removed: [] as string[], local: [] as { id: string; updatedAt: string; data: Record<string, unknown>; files: never[] }[] }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
  let single = false;
  const q: Record<string, unknown> = { then: (done: (x: unknown) => unknown) => Promise.resolve(done(net.fail ? { data: null, error: { message: "network" } } : { data: single ? null : [], error: null })) };
  for (const n of ["select", "eq", "order", "limit"]) q[n] = () => q;
  q["maybeSingle"] = () => { single = true; return q; };
  q["upsert"] = async (row: unknown) => { net.upserts.push(row); return { error: null }; };
  return q; } } }));
vi.mock("./offline", () => ({
  localDrafts: async () => net.local,
  removeLocalDraft: async (_owner: string, id: string) => { net.removed.push(id); },
  putLocalDraft: async () => undefined,
  localToFile: () => new File([], "x"),
}));
import { draftsForReport, getDraft, syncLocalDrafts } from "./drafts";
import { buildReportDoc, emptyFilters, type ReportData } from "./report-centre";

const OWNER = "owner-1";
beforeEach(() => { net.fail = true; net.upserts = []; net.removed = []; net.local = []; });

describe("P0-004 draft reads", () => {
  it("opening a draft whose read failed reports an error instead of 'no longer available'", async () => {
    await expect(getDraft("d1")).rejects.toThrow(/Couldn't open that draft\. Nothing has been deleted/);
    await expect(getDraft("d1", { localFallbackOwner: OWNER })).rejects.toThrow(/Couldn't open that draft/);
    net.fail = false;
    await expect(getDraft("d1")).resolves.toBeNull();
  });

  it("falls back to this device's own copy only when there is one", async () => {
    net.local = [{ id: "d1", updatedAt: "2026-11-10T10:00:00Z", data: { amount: "120" }, files: [] }];
    await expect(getDraft("d1", { localFallbackOwner: OWNER })).resolves.toBeNull();
  });

  it("device sync keeps the device copy and uploads nothing when the account read fails", async () => {
    net.local = [{ id: "d1", updatedAt: "2026-11-10T10:00:00Z", data: { amount: "120", merchant: "Cafe" }, files: [] }];
    await expect(syncLocalDrafts(OWNER)).resolves.toBe(0);
    expect(net.upserts).toEqual([]);
    expect(net.removed).toEqual([]);
  });

  it("the Drafts report says the list may be incomplete when account drafts could not be loaded", async () => {
    net.local = [{ id: "d2", updatedAt: "2026-11-10T10:00:00Z", data: { amount: "50" }, files: [] }];
    const r = await draftsForReport(OWNER, true);
    expect(r.server).toEqual([]);
    expect(r.incomplete).toMatch(/couldn't be loaded/);
    expect((await draftsForReport(OWNER, false)).incomplete).toMatch(/offline/);
    net.fail = false;
    expect((await draftsForReport(OWNER, true)).incomplete).toBeNull();

    const data = { transactions: [], accounts: [], valuations: [], commitments: [], loans: [], budgets: {}, trips: [], memberName: () => "You", accountName: () => "—", today: "2026-11-10",
      drafts: [{ id: "d2", status: "waiting_to_sync", updatedAt: "2026-11-10T10:00:00Z", data: { amount: "50" }, localOnly: true }] } satisfies ReportData;
    const filters = emptyFilters("2026-11-01", "2026-11-30");
    const incomplete = buildReportDoc("drafts", filters, { ...data, draftsIncomplete: r.incomplete });
    expect(incomplete.notes[0]).toMatch(/^This list may be incomplete: Drafts saved to your account couldn't be loaded\./);
    expect(incomplete.summary).toContainEqual(["List complete", "No — may be incomplete"]);
    const complete = buildReportDoc("drafts", filters, data);
    expect(complete.notes.join(" ")).not.toMatch(/may be incomplete/);
  });
});
