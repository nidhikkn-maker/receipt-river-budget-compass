// R12: derived posting ids (depreciation, impairment, disposal) must be unique per owner, while ids already stored
// stay exactly as they are. Pure; in memory.
import { describe, expect, it } from "vitest";
import { depreciationEntryKey, derivedPostingKeys, disposalKey, eventPostings, impairmentKey, ownerPostingId, postingIdFor, resolvePostingIds, restoredPostingIds, stableUuid } from "./assets-ledger";
import type { Asset } from "../assets";

const A = "00000000-0000-4000-8000-0000000000a1", B = "00000000-0000-4000-8000-0000000000b2";
const asset = "20000000-0000-4000-8000-000000000003";

describe("derived posting ids", () => {
  it("legacy ids are key-only, so two owners holding the same (restored) asset derive the SAME entry id", async () => {
    // Asset ids are owner-local JSON ids that a cross-account restore keeps; the legacy id ignores the owner.
    const forA = await stableUuid(...depreciationEntryKey(asset, "2026-05"));
    const forB = await stableUuid(...depreciationEntryKey(asset, "2026-05"));
    expect(forA).toBe(forB); // collision on the global expenses primary key
  });

  it("new postings use owner-scoped ids that differ between owners and are stable for retries", async () => {
    const key = depreciationEntryKey(asset, "2026-05");
    const a = await postingIdFor(A, key, new Set()), b = await postingIdFor(B, key, new Set());
    expect(a.id).not.toBe(b.id);
    expect(a).toEqual({ id: await ownerPostingId(A, key), posted: false });
    expect((await postingIdFor(A, key, new Set([a.id]))).posted).toBe(true);
    expect(a.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("an entry already stored under the legacy id keeps it (never renumbered; a retry finds it)", async () => {
    const key = depreciationEntryKey(asset, "2026-04");
    const legacy = await stableUuid(...key);
    expect(await postingIdFor(A, key, new Set([legacy]))).toEqual({ id: legacy, posted: true });
  });

  it("event posting keys are unchanged from earlier releases", () => {
    const a = { id: asset, name: "Laptop", kind: "computer", cost: 100000, inUse: "2025-04-01", sharePct: 100, bookMethod: "slm", bookRatePct: 20, accountId: "acct", soldOn: "2026-06-30", saleValue: 10, adjustments: [{ date: "2025-12-31", amount: -5000, kind: "impairment", note: "" }] } as Asset;
    const keys = eventPostings(a, []).postings.map((p) => p.key);
    expect(keys).toEqual([["impairment", asset, "2025-12-31", "5000"], ["disposal", asset, "2026-06-30"]]);
    expect([...impairmentKey(asset, "2025-12-31", 5000)]).toEqual(keys[0]);
    expect([...disposalKey(asset, "2026-06-30")]).toEqual(keys[1]);
  });

  it("restore maps the old owner's derived postings to the new owner's ids", async () => {
    const prefs = { assets: [{ id: asset, soldOn: "2026-06-30", adjustments: [{ date: "2025-12-31", amount: -5000, kind: "impairment" }] }], books: { journals: [{ assetId: asset, period: "2026-04" }, { assetId: asset, period: "2026-05" }] } };
    expect(derivedPostingKeys(prefs).length).toBe(4);
    const legacyApr = await stableUuid(...depreciationEntryKey(asset, "2026-04"));
    const scopedMay = await ownerPostingId(A, depreciationEntryKey(asset, "2026-05"));
    const disposal = await stableUuid(...disposalKey(asset, "2026-06-30"));
    const map = await restoredPostingIds(prefs, new Set([legacyApr, scopedMay, disposal]), A, B);
    expect(map.get(legacyApr)).toBe(await ownerPostingId(B, depreciationEntryKey(asset, "2026-04")));
    expect(map.get(scopedMay)).toBe(await ownerPostingId(B, depreciationEntryKey(asset, "2026-05")));
    expect(map.get(disposal)).toBe(await ownerPostingId(B, disposalKey(asset, "2026-06-30")));
    expect(map.size).toBe(3);
    // After the restore, B's page sees them as posted (no duplicate posting).
    expect((await postingIdFor(B, depreciationEntryKey(asset, "2026-04"), new Set(map.values()))).posted).toBe(true);
  });

  it("restore never gives two backup entries the same id when one posting key has a legacy and a scoped copy", async () => {
    // A stale client can post a legacy-id copy after a new client posted the owner-scoped one (or the reverse).
    const prefs = { books: { journals: [{ assetId: asset, period: "2026-04" }] } };
    const key = depreciationEntryKey(asset, "2026-04");
    const legacy = await stableUuid(...key), scopedA = await ownerPostingId(A, key);
    const map = await restoredPostingIds(prefs, new Set([legacy, scopedA]), A, B);
    expect(map.get(legacy)).toBe(await ownerPostingId(B, key));
    expect(map.has(scopedA)).toBe(false); // keeps its ordinary restore id, so both rows survive
    expect(new Set(map.values()).size).toBe(map.size);
  });

  it("checks the saved records, not only the loaded list: a saved legacy entry is reused even when not on screen", async () => {
    const keys = [depreciationEntryKey(asset, "2026-04"), depreciationEntryKey(asset, "2026-05"), disposalKey(asset, "2026-06-30")];
    const legacyApr = await stableUuid(...keys[0]!), scopedMay = await ownerPostingId(A, keys[1]!);
    const asked: string[][] = [];
    const saved = async (ids: string[]) => { asked.push(ids); return new Set(ids.filter((id) => id === legacyApr || id === scopedMay)); };
    // The loaded list is empty (e.g. not yet loaded or truncated): the set-based helper would choose a new id.
    expect((await postingIdFor(A, keys[0]!, new Set())).id).not.toBe(legacyApr);
    expect(await resolvePostingIds(A, keys, saved)).toEqual([
      { id: legacyApr, posted: true },
      { id: scopedMay, posted: true },
      { id: await ownerPostingId(A, keys[2]!), posted: false },
    ]);
    expect(asked).toHaveLength(1); // one owner-filtered read for the whole batch
    expect(asked[0]).toHaveLength(6);
  });

  it("never guesses: a failed read or a missing owner stops the posting", async () => {
    const key = depreciationEntryKey(asset, "2026-04");
    await expect(resolvePostingIds(A, [key], () => Promise.reject(Error("offline")))).rejects.toThrow("offline");
    await expect(postingIdFor("", key, new Set())).rejects.toThrow("Sign in again");
    expect(await resolvePostingIds(A, [], () => Promise.reject(Error("not called")))).toEqual([]);
  });
});
