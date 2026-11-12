// Phase 0 (V4 FND-05): historical records are never silently dropped, truncated or rewritten by load/save.
// Deterministic datasets (no randomness) sized well above every previous cap.
import { describe, expect, it } from "vitest";
import { normalizePreferences, type FinancePreferences } from "./preferences";
import { canonical, preserveForSave, unreadableRecords } from "./preserve-records";
import { mergeUploadHistory } from "./statement-pipeline/history";
import { withPreparedJournals, scheduledRun } from "./books/assets-ledger";
import { addSnapshot } from "./books/market";
import { recordProgress } from "./intelligence";
import { unmappedFields } from "./books/intake";
import { demoCleanupDecision, removeDemoGuestRecords } from "./demo-cleanup";
import type { StatementUpload } from "./preferences";

const pad = (n: number, w = 5) => String(n).padStart(w, "0");
const day = (n: number) => new Date(Date.UTC(2020, 0, 1) + n * 864e5).toISOString().slice(0, 10);
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Stored data as the database holds it: large lists plus a few records the app cannot read. */
function storedFixture(): Record<string, unknown> {
  return {
    theme: "light",
    assets: [
      ...range(260).map((i) => ({ id: `ast-${pad(i)}`, name: `Asset ${i}`, kind: "computer", cost: 1000 + i, inUse: day(i), sharePct: i % 50 === 0 ? 150 : 100, bookMethod: "slm", bookRatePct: 20 })),
      { id: "ast-bad", name: "No cost", kind: "computer", inUse: "2024-01-01" },
    ],
    entities: [
      ...range(70).map((i) => ({ id: `ent-${pad(i)}`, name: i === 3 ? "N".repeat(150) : `Company ${i}`, kind: "company", pan: "", gstins: [], booksFrom: "2026-27" })),
      { id: "ent-bad", name: "Unknown kind", kind: "spaceship" },
    ],
    statementUploads: [
      { id: "up-big", at: "2026-10-01T00:00:00Z", label: "October", posted: range(3500).map((i) => `p-${pad(i)}`), reconciled: range(3200).map((i) => `r-${pad(i)}`), createdAccounts: [], status: "complete", expected: { posted: 3500, reconciled: 3200 } },
      { id: 42, at: "corrupt upload record" },
    ],
    statementBatches: Object.fromEntries(range(60).map((b) => [`batch-${b}`, range(2500).map((i) => `e-${b}-${i}`)])),
    decisions: range(350).map((i) => ({ id: `dec-${i}` })),
    books: {
      journals: [...range(6000).map((i) => ({ id: `jr-${pad(i)}`, assetId: `ast-${pad(i % 260)}`, period: day(i).slice(0, 7), amount: 10 + (i % 7), kind: "book", status: "posted" })), { id: "jr-bad", amount: "ten" }],
      assetEvents: range(4000).map((i) => ({ id: `ev-${pad(i)}`, assetId: `ast-${pad(i % 260)}`, date: day(i), kind: "maintenance" })),
      leases: range(600).map((i) => ({ id: `ls-${pad(i)}`, start: day(i), end: day(i + 365), rent: 1000 + i })),
      gstInvoices: range(12000).map((i) => ({ id: `inv-${pad(i)}`, date: day(i % 2000), taxable: 100 + i })),
      closedPeriods: range(250).map((i) => ({ id: `cp-${i}`, from: day(i * 30), to: day(i * 30 + 29) })),
      snapshots: range(2000).map((i) => ({ date: day(i), netWorth: 1e6 + i, portfolio: 1000 + i })),
      holdings: [...range(600).map((i) => ({ id: `h-${pad(i)}`, quantity: i + 1, sharePct: i === 7 ? 150 : 100, source: "broker" })), { id: "h-bad", quantity: "lots" }],
      docLinks: range(3500).map((i) => ({ docId: `d-${i}`, targetId: `t-${i}`, kind: "asset" })),
      entityAccounts: { "ent-00001": ["acc-1", "acc-2"], "ent-broken": "not-a-list" },
      goldRate: { perGram24k: "unknown" },
    },
  };
}
/** The display view; asserts at runtime that every section the tests read was filled in. */
const view = (raw: Record<string, unknown>) => {
  const p = normalizePreferences(raw as Partial<FinancePreferences>);
  if (!p.books || !p.assets || !p.entities || !p.statementUploads) throw new Error("normalizePreferences must fill every section");
  return { ...p, books: p.books, assets: p.assets, entities: p.entities, statementUploads: p.statementUploads };
};
const books = (x: unknown) => (x as { books: Record<string, unknown[]> }).books;

describe("loading never truncates history (previous caps exceeded)", () => {
  const v = view(storedFixture());
  it("keeps every readable record visible", () => {
    expect(v.books.journals).toHaveLength(6000); // was capped at 5,000
    expect(v.books.assetEvents).toHaveLength(4000); // 3,000
    expect(v.books.leases).toHaveLength(600); // 500
    expect(v.books.gstInvoices).toHaveLength(12000); // 10,000
    expect(v.books.closedPeriods).toHaveLength(250); // 200
    expect(v.books.snapshots).toHaveLength(2000); // 1,500
    expect(v.books.holdings).toHaveLength(600); // 500
    expect(v.books.docLinks).toHaveLength(3500); // 3,000
    expect(v.assets).toHaveLength(260); // 200
    expect(v.entities).toHaveLength(70); // 50
    expect(v.decisions).toHaveLength(350); // 300
    expect(Object.keys(v.statementBatches ?? {})).toHaveLength(60); // 50 batches × 2,000 ids
    expect(v.statementBatches?.["batch-59"]).toHaveLength(2500);
    const up = v.statementUploads.find((u) => u.id === "up-big")!;
    expect(up.posted).toHaveLength(3500); // 3,000
    expect(up.reconciled).toHaveLength(3200);
    expect(up.expected).toEqual({ posted: 3500, reconciled: 3200 }); // counts were clamped to 3,000
  });
  it("still keeps display safety (unreadable records hidden, values tidied for screens only)", () => {
    expect(v.books.journals.some((j) => j.id === "jr-bad")).toBe(false);
    expect(v.assets.find((a) => a.id === "ast-00000")!.sharePct).toBe(100);
    expect(v.entities.find((e) => e.id === "ent-00003")!.name).toHaveLength(120);
  });
});

describe("saving never drops or rewrites what the owner did not change", () => {
  it("an unchanged save writes back exactly what is stored, including unreadable records", () => {
    const raw = storedFixture();
    const out = preserveForSave(raw, view(raw)) as unknown as Record<string, unknown>;
    // Every stored key is written back byte-for-byte; the only additions are the app's default settings.
    for (const k of Object.keys(raw)) expect(canonical(out[k])).toBe(canonical(raw[k]));
    const defaults = normalizePreferences({}) as unknown as Record<string, unknown>;
    for (const k of Object.keys(out)) if (!(k in raw)) expect(k in defaults).toBe(true);
  });
  it("changing an unrelated setting leaves every financial section byte-identical", () => {
    const raw = storedFixture();
    const out = preserveForSave(raw, { ...view(raw), theme: "dark" } as FinancePreferences) as unknown as Record<string, unknown>;
    expect(out["theme"]).toBe("dark");
    for (const k of ["assets", "entities", "statementUploads", "statementBatches", "decisions", "books"]) expect(canonical(out[k])).toBe(canonical(raw[k]));
  });
  it("adding a journal keeps all 6,001 stored journals (including the unreadable one) and adds the new one", () => {
    const raw = storedFixture(); const v = view(raw);
    const added = { id: "jr-new", assetId: "ast-00001", period: "2026-10", amount: 99, kind: "book" as const, status: "prepared" as const };
    const out = books(preserveForSave(raw, { ...v, books: { ...v.books, journals: [...v.books.journals, added] } }));
    expect(out["journals"]).toHaveLength(6002);
    expect(out["journals"]!.some((j) => (j as { id: string }).id === "jr-bad")).toBe(true);
    expect(out["journals"]!.slice(0, 6000)).toEqual((raw["books"] as Record<string, unknown[]>)["journals"]!.slice(0, 6000));
  });
  it("deleting a journal deliberately removes only that journal", () => {
    const raw = storedFixture(); const v = view(raw);
    const out = books(preserveForSave(raw, { ...v, books: { ...v.books, journals: v.books.journals.filter((j) => j.id !== "jr-00010") } }));
    expect(out["journals"]).toHaveLength(6000);
    expect(out["journals"]!.some((j) => (j as { id: string }).id === "jr-00010")).toBe(false);
    expect(out["journals"]!.some((j) => (j as { id: string }).id === "jr-bad")).toBe(true);
  });
  it("editing a record that was tidied for display keeps the stored original in preservedRecords; untouched tidied records stay as stored", () => {
    const raw = storedFixture(); const v = view(raw);
    const assets = v.assets.map((a) => (a.id === "ast-00000" ? { ...a, name: "Renamed laptop" } : a));
    const out = preserveForSave(raw, { ...v, assets }) as unknown as Record<string, unknown[]>;
    const stored = out["assets"] as { id: string; sharePct: number; name: string }[];
    expect(stored.find((a) => a.id === "ast-00000")!.name).toBe("Renamed laptop");
    expect(stored.find((a) => a.id === "ast-00050")!.sharePct).toBe(150); // untouched: stored value kept
    expect(stored.some((a) => a.id === "ast-bad")).toBe(true); // unreadable asset kept
    expect(out["preservedRecords"]).toEqual([expect.objectContaining({ path: "assets", reason: "replaced-after-display-adjustment", record: expect.objectContaining({ id: "ast-00000", sharePct: 150 }) })]);
  });
  it("a corrupt map entry and an unreadable gold rate survive edits to the same section", () => {
    const raw = storedFixture(); const v = view(raw);
    const out = books(preserveForSave(raw, { ...v, books: { ...v.books, entityAccounts: { ...v.books.entityAccounts, "ent-00002": ["acc-9"] } } }));
    expect(out["entityAccounts"]).toMatchObject({ "ent-broken": "not-a-list", "ent-00002": ["acc-9"] });
    expect(out["goldRate"]).toEqual({ perGram24k: "unknown" });
  });
  it("lists every unreadable record for owner review", () => {
    const found = unreadableRecords(storedFixture()).map((r) => `${r.path}:${JSON.stringify(r.record).slice(0, 20)}`);
    expect(found).toEqual(expect.arrayContaining([expect.stringMatching(/^assets:.*ast-bad/), expect.stringMatching(/^entities:.*ent-bad/), expect.stringMatching(/^statementUploads:/), expect.stringMatching(/^books\.journals:.*jr-bad/), expect.stringMatching(/^books\.holdings:.*h-bad/), expect.stringMatching(/^books\.entityAccounts:/), expect.stringMatching(/^books\.goldRate:/)]));
    expect(found).toHaveLength(7);
  });
});

describe("statement upload history checkpoints", () => {
  it("never shortens or drops older uploads, including unreadable ones", () => {
    const raw = storedFixture();
    const next: StatementUpload = { id: "up-new", at: "2026-11-01T00:00:00Z", label: "November", posted: ["x"], reconciled: [], createdAccounts: [], status: "interrupted" };
    const out = mergeUploadHistory(raw as unknown as FinancePreferences, next).statementUploads as unknown[];
    expect(out).toHaveLength(3);
    expect(out.slice(1)).toEqual(raw["statementUploads"]);
  });
});

describe("scheduled depreciation", () => {
  it("appends only new journals to the stored list and never replaces it", () => {
    const raw = storedFixture();
    const stored = (raw["books"] as Record<string, unknown[]>)["journals"]!;
    const added = [{ id: "jr-00001", assetId: "x", period: "2026-10", amount: 1, kind: "book" as const, status: "prepared" as const }, { id: "jr-fresh", assetId: "x", period: "2026-10", amount: 1, kind: "book" as const, status: "prepared" as const }];
    const out = withPreparedJournals(raw["books"], added)!;
    expect(out["journals"]).toEqual([...stored, ...added.slice(1)]);
    expect(out["leases"]).toBe((raw["books"] as Record<string, unknown>)["leases"]);
    expect(withPreparedJournals({ journals: "corrupt" }, added)).toBeNull();
  });
  it("prepares journals for assets beyond the old 200-asset cap", async () => {
    const assets = view(storedFixture()).assets.map((a) => ({ ...a, accountId: "acc-asset" }));
    const run = await scheduledRun(assets, [], [], "2020-12-15");
    expect(run.added.some((j) => j.assetId === "ast-00250")).toBe(true);
  });
});

describe("other history lists are no longer capped on write", () => {
  it("net-worth snapshots, milestone progress and proposed document fields keep full history", () => {
    let snaps = range(1600).map((i) => ({ date: day(i), netWorth: i, portfolio: i }));
    snaps = addSnapshot(snaps as never, { date: day(1600), netWorth: 1, portfolio: 1 } as never) as never;
    expect(snaps).toHaveLength(1601);
    const m = { history: range(200).map((i) => ({ date: day(i), value: i })) } as never;
    expect(recordProgress(m, 5, day(300)).history).toHaveLength(201);
    const known = range(320).map((i) => ({ label: `Field ${i}`, docType: "invoice", seen: 1, status: "proposed" })) as never;
    expect(unmappedFields(["Brand new label"], "invoice" as never, known)).toHaveLength(321);
  });
});

describe("demo cleanup fails closed", () => {
  it("removes records only for a confirmed anonymous guest", () => {
    expect(demoCleanupDecision({ user: { is_anonymous: true } })).toBe("remove-guest-records");
    expect(demoCleanupDecision({ user: { is_anonymous: false } })).toBe("keep-upgraded-account");
    expect(demoCleanupDecision({ user: null, error: new Error("auth api down") })).toBe("skip-unconfirmed");
    expect(demoCleanupDecision({ user: { is_anonymous: null } })).toBe("keep-upgraded-account");
    expect(demoCleanupDecision(null)).toBe("skip-unconfirmed");
  });

  it("removes a guest's records in order, including P20 claim corrections; a failed required step stops (identity kept)", async () => {
    const run = async (fail: Record<string, unknown>) => {
      const calls: string[] = [];
      const result = await removeDemoGuestRecords((table) => ({ delete: () => ({ eq: async (column: string, value: string) => {
        calls.push(`${table}.${column}=${value}`); return { error: fail[table] ?? null };
      } }) }), "g");
      return { ...result, calls };
    };
    const all = ["expenses.employee_id=g", "accounts.owner_id=g", "claim_receipt_corrections.owner_id=g", "finance_preferences.owner_id=g"];
    expect(await run({})).toEqual({ ok: true, calls: all });
    // before P20 is installed the corrections table is missing: only that answer is skipped, the cleanup continues
    expect(await run({ claim_receipt_corrections: { code: "42P01", message: 'relation "public.claim_receipt_corrections" does not exist' } })).toEqual({ ok: true, calls: all });
    expect(await run({ claim_receipt_corrections: { code: "PGRST205", message: "Could not find the table 'public.claim_receipt_corrections' in the schema cache" } })).toEqual({ ok: true, calls: all });
    expect(await run({ expenses: new Error("expenses failed") })).toMatchObject({ ok: false, table: "expenses", calls: ["expenses.employee_id=g"] });
    expect(await run({ accounts: new Error("accounts failed") })).toMatchObject({ ok: false, table: "accounts", calls: ["expenses.employee_id=g", "accounts.owner_id=g"] });
  });

  it("any other claim_receipt_corrections error stops before the identity is deleted and is reported", async () => {
    for (const error of [{ code: "P0001", message: "P20_AUDIT_READ_ONLY" }, { code: "42501", message: "permission denied for table claim_receipt_corrections" }, new Error("fetch failed"), { message: "timeout" }]) {
      const calls: string[] = [];
      const result = await removeDemoGuestRecords((table) => ({ delete: () => ({ eq: async () => { calls.push(table); return { error: table === "claim_receipt_corrections" ? error : null }; } }) }), "g");
      expect(result).toMatchObject({ ok: false, table: "claim_receipt_corrections" });
      expect(result.ok ? "" : result.error).toContain((error as { message: string }).message);
      // stopped at the corrections step: nothing after it ran, and the caller keeps the identity
      expect(calls).toEqual(["expenses", "accounts", "claim_receipt_corrections"]);
    }
  });
});
