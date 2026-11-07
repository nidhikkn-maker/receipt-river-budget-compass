import { describe, expect, it } from "vitest";
import type { Asset } from "../assets";
import { preparedSummary, scheduledRun } from "./assets-ledger";

const asset = (x: Partial<Asset> = {}): Asset => ({ id: "a1", name: "Laptop", kind: "computer", cost: 120000, inUse: "2026-09-01", sharePct: 100, bookMethod: "slm", bookRatePct: 0, usefulLifeYears: 5, residualPct: 0, accountId: "acc-asset", ...x } as Asset);

describe("scheduled monthly depreciation", () => {
  it("prepares last month's journal on the 1st without opening the Assets page", async () => {
    const r = await scheduledRun([asset()], [], [], "2026-11-01");
    expect(r.added.map((j) => j.period)).toEqual(["2026-09", "2026-10"]);
    expect(r.added.every((j) => j.status === "prepared")).toBe(true);
    expect(r.added[1]!.amount).toBe(2000);
  });
  it("a rerun adds nothing and ids are stable per asset-month", async () => {
    const first = await scheduledRun([asset()], [], [], "2026-11-01");
    const again = await scheduledRun([asset()], first.journals, [], "2026-11-02");
    expect(again.added).toEqual([]);
    const fresh = await scheduledRun([asset()], [], [], "2026-11-03");
    expect(fresh.added.map((j) => j.id)).toEqual(first.added.map((j) => j.id));
  });
  it("never prepares a closed month", async () => {
    const r = await scheduledRun([asset()], [], [{ id: "p", from: "2026-09-01", to: "2026-09-30", closedOn: "2026-10-05", note: "closed" } as never], "2026-11-01");
    expect(r.added.map((j) => j.period)).toEqual(["2026-10"]);
  });
  it("lists assets that can't run instead of silently skipping them", async () => {
    const r = await scheduledRun([asset({ id: "b", name: "Printer", usefulLifeYears: 0, bookRatePct: 0 })], [], [], "2026-11-01");
    expect(r.added).toEqual([]);
    expect(r.exceptions).toEqual([{ assetId: "b", name: "Printer", reasons: ["no useful life or rate"] }]);
  });
  it("land/property and sold assets are not depreciated", async () => {
    const r = await scheduledRun([asset({ kind: "property" }), asset({ id: "s", soldOn: "2026-10-10" })], [], [], "2026-11-01");
    expect(r.added).toEqual([]);
  });
  it("the Inbox summary groups prepared journals by month", async () => {
    const r = await scheduledRun([asset(), asset({ id: "a2", cost: 60000 })], [], [], "2026-11-01");
    expect(preparedSummary(r.journals)[0]).toEqual({ month: "2026-10", count: 2, total: 3000 });
  });
});
