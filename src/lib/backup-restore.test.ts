// Phase 2 backup restore integrity (R5, R8, R10): complete cross-account remap, byte-identical same-account restore,
// idempotent repeat restores, legacy v1/v2 files and investment tables. Pure and in memory; never touches Cloud.
import { describe, expect, it } from "vitest";
import { strToU8 } from "fflate";
import { BACKUP_TABLES, createBackupZip, investmentTablesToWrite, planRestore, prepareRestore, readBackup, type Backup } from "./backup";
import { REMAP_TABLES } from "./backup-remap";
import { depreciationEntryKey, ownerPostingId } from "./books/assets-ledger";
import { ID, OWNER_A, OWNER_B, buildBackupFixture, fixtureFiles, legacyDepreciationId } from "../test/backup-fixture";
import { allRefs, moneyTotals, orphans, rowIds } from "../test/backup-refs";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
/** Test-only loose view of stored preference JSON (shape varies by register). */
type Loose = ReturnType<typeof JSON.parse>;
const prefsOf = (d: Backup["data"]): Loose => d.finance_preferences?.[0]?.["data"];
const counter = () => { let n = 0; return () => `90000000-0000-4000-8000-${String(++n).padStart(12, "0")}`; };

/** Data with the deliberately verbatim sections removed (archived closure evidence, preserved originals, frozen drafts). */
function withoutVerbatim(data: Backup["data"]) {
  const d = clone(data);
  delete d.period_close_evidence; delete d.imported_period_history;
  const p = prefsOf(d); delete p["preservedRecords"]; delete p["books"]["savedDrafts"]; delete p["books"]["closedPeriods"]; delete p["books"]["periodLog"];
  return d;
}
/** Restored totals keyed the same way as the original (entity ids are owner-local and preserved). */
const totals = (d: Backup["data"]) => moneyTotals(d);

describe("cross-account restore remaps every reference (R5)", () => {
  it("the fixture itself is consistent: every registered reference resolves before restore", async () => {
    const b = await buildBackupFixture();
    expect(orphans(b.data)).toEqual([]);
    expect(allRefs(b.data).length).toBeGreaterThan(100);
  });

  it("legacy entry point (prepareRestore with random ids) leaves zero orphans", async () => {
    const b = await buildBackupFixture();
    const r = prepareRestore(b, OWNER_B, counter(), true);
    expect(orphans(r.data)).toEqual([]);
  });

  it("app restore: zero orphans, nothing unmapped or unclassified, no old row id left outside verbatim archives", async () => {
    const b = await buildBackupFixture();
    const r = await planRestore(b, OWNER_B, { stageFiles: true });
    expect(orphans(r.data)).toEqual([]);
    expect(r.report.unmapped).toEqual([]);
    expect(r.report.unclassified).toEqual([]);
    expect(r.report.crossAccount).toBe(true);
    const text = JSON.stringify(withoutVerbatim(r.data));
    const old = [...rowIds(b.data).values()].flatMap((s) => [...s]);
    expect(old.filter((id) => text.includes(id))).toEqual([]);
    // Every row id is new and every owner column is the restoring owner.
    for (const t of REMAP_TABLES) for (const row of r.data[t] ?? []) expect(old).not.toContain(row["id"]);
    for (const t of BACKUP_TABLES) for (const row of r.data[t] ?? []) expect(row[t === "expenses" ? "employee_id" : "owner_id"]).toBe(OWNER_B);
  });

  it("keeps owner-local JSON ids (entities, assets, payees, trips, methods, properties) and the columns that use them", async () => {
    const b = await buildBackupFixture();
    const r = await planRestore(b, OWNER_B);
    const p = prefsOf(r.data), o = prefsOf(b.data);
    expect(p["entities"]).toEqual(o["entities"]);
    expect(p["assets"].map((a: { id: string }) => a.id)).toEqual(o["assets"].map((a: { id: string }) => a.id));
    expect(p["payees"]).toBe(o["payees"]);
    expect(p["trips"][0].id).toBe(ID.trip);
    expect(Object.keys(p["books"]["entityAccounts"])).toEqual([ID.company, ID.person]);
    const hotel = r.data.expenses?.find((e) => e["title"] === "Hotel");
    expect([hotel?.["payee_id"], hotel?.["payment_instrument_id"]]).toEqual([ID.payee, ID.instrument]);
    expect(r.data.expenses?.find((e) => e["title"] === "Laptop")?.["entity_id"]).toBe(ID.company);
  });

  it("follows specific links to the right new rows", async () => {
    const b = await buildBackupFixture();
    const r = await planRestore(b, OWNER_B);
    const id = (table: (typeof REMAP_TABLES)[number], pick: (row: Record<string, unknown>) => boolean) => r.data[table]?.find(pick)?.["id"];
    const bank = id("accounts", (a) => a["name"] === "HDFC Savings"), laptop = id("expenses", (e) => e["title"] === "Laptop"), loan = id("loans", () => true);
    const p = prefsOf(r.data);
    expect(p["books"]["entityAccounts"][ID.company]).toEqual([id("accounts", (a) => a["name"] === "KR Current"), id("accounts", (a) => a["name"] === "Fixed assets")]);
    expect(p["assets"][0].transactionId).toBe(laptop);
    expect(p["books"]["docLinks"][0].targetId).toBe(laptop);
    expect(p["books"]["docLinks"][1].targetId).toBe(ID.laptopAsset);
    expect(p["books"]["docLinks"][2].targetId).toBe(loan);
    expect(p["books"]["docLinks"][3].targetId).toBe(ID.company);
    expect(p["statementBalances"]).toEqual({ [String(bank)]: { balance: 41234.5, date: "2026-04-30" } });
    expect(p["mapLinks"][0]).toMatchObject({ from: `account:${String(bank)}`, to: `loan:${String(loan)}` });
    expect(p["mapLinks"][1].from).toBe(`method:${ID.instrument}`);
    expect(p["inboxDismissed"][3]).toBe("sync:2");
    const [g, t] = [id("expenses", (e) => e["title"] === "Groceries"), id("expenses", (e) => e["title"] === "Card bill")].map(String);
    expect(p["inboxDismissed"][1]).toBe(`dup:${[g, t].sort().join(":")}`);
    expect(p["reimbursementSettings"]["mappings"][0].activity).toBe(`entries:${[g, String(id("expenses", (e) => e["title"] === "Hotel"))].sort().join(",")}`);
    expect(p["reimbursementSettings"]["mappings"][1].activity).toBe("travel");
    expect(p["budgets"][1].value).toBe("me");
    // A saved draft shares its id with the entry it became; both get the same new id.
    expect(r.data.expense_drafts?.find((d) => d["status"] === "saved")?.["id"]).toBe(g);
    expect(r.data.documents?.find((d) => d["title"] === "Dell invoice (revised)")?.["replaces_id"]).toBe(id("documents", (d) => d["title"] === "Dell invoice"));
    expect(r.data.expenses?.find((e) => e["title"] === "Card bill")?.["transfer_counterpart_of"]).toBe(g);
  });

  it("follows links found in the type-path review: saved views, traveller budgets, bond terms, category splits, claim receipts, settlements", async () => {
    const b = await buildBackupFixture();
    const r = await planRestore(b, OWNER_B);
    const p = prefsOf(r.data);
    const row = (table: (typeof REMAP_TABLES)[number], pick: (x: Record<string, unknown>) => boolean) => r.data[table]?.find(pick);
    const spouse = row("family_members", () => true)?.["id"], card = row("accounts", (a) => a["name"] === "HDFC Visa")?.["id"], cas = row("documents", (d) => d["title"] === "CDSL CAS")?.["id"];
    // Saved views: ids follow; sentinels and owner-local method ids stay.
    expect(p["savedViews"][0].filters).toEqual({ memberId: spouse, accountId: card, category: "Groceries", paymentInstrumentId: ID.instrument });
    expect(p["savedViews"][1].filters).toEqual({ memberId: "me", accountId: "all" });
    // Traveller budgets: a family member id follows; "Me" and typed names are labels, not references.
    expect(p["trips"][0].travellerBudgets).toEqual([{ traveller: spouse, amount: 10000 }, { traveller: "Me", amount: 15000 }, { traveller: "Ravi", amount: 5000 }]);
    expect(p["trips"][0].travellers).toEqual(["Asha", "Ravi"]);
    expect(p["books"]["holdings"][1].bond.docId).toBe(cas);
    const groceries = row("expenses", (e) => e["title"] === "Groceries");
    expect(groceries?.["allocations"]).toEqual([{ category: "Groceries", amount: 1500, memberId: spouse }, { category: "Household expenses", amount: 1000, memberId: null }]);
    expect(groceries?.["description"]).toBe("Claimed on LL-DES-20260410-100000"); // readable references never change
    const claimBack = row("expenses", (e) => e["title"] === "AET reimbursement")?.["id"];
    const receipt = (row("expenses", (e) => e["title"] === "Hotel")?.["reimbursement"] as { receipts: { id: string; txnId: string }[] }).receipts[0];
    expect(receipt).toMatchObject({ id: claimBack, txnId: claimBack });
    const settlement = (row("expenses", (e) => e["title"] === "RCM GST")?.["receipt_details"] as Loose).accounting.journal.settlement;
    expect(settlement.entryId).toBe(row("expenses", (e) => e["title"] === "Laptop")?.["id"]);
    const original = (b.data.expenses?.find((e) => e["title"] === "RCM GST")?.["receipt_details"] as Loose).accounting.journal;
    expect(settlement.journalId).toBe(original.settlement.journalId); // owner-local journal id kept
    expect(settlement.snapshot.accountId).toBe(row("accounts", (a) => a["name"] === "KR Current")?.["id"]);
    expect(settlement.snapshot.allocations[0].memberId).toBe(spouse);
  });

  it("a claim receipt with its own id (not the entry id) keeps that id; a uuid-shaped traveller not in the backup is reported", async () => {
    const b = await buildBackupFixture();
    const own = "50000000-0000-4000-8000-000000000001", gone = "40000000-0000-4000-8000-000000000009";
    const hotel = b.data.expenses?.find((e) => e["title"] === "Hotel") as Loose;
    hotel.reimbursement.receipts[0].id = own;
    prefsOf(b.data)["trips"][0].travellerBudgets.push({ traveller: gone, amount: 1 });
    const r = await planRestore(b, OWNER_B);
    expect((r.data.expenses?.find((e) => e["title"] === "Hotel") as Loose).reimbursement.receipts[0].id).toBe(own);
    expect(prefsOf(r.data)["trips"][0].travellerBudgets[3]).toEqual({ traveller: gone, amount: 1 });
    expect(r.report.unmapped).toEqual([{ path: "finance_preferences[0].data.trips[0].travellerBudgets[3].traveller", value: gone, expected: "family_members" }]);
    expect(r.report.unclassified).toEqual([]);
  });

  it("keeps counts and money totals per entity, account and currency identical", async () => {
    const b = await buildBackupFixture();
    const r = await planRestore(b, OWNER_B, { stageFiles: true });
    expect(totals(r.data)).toEqual(totals(b.data));
    expect(Object.keys(totals(b.data).entries).length).toBeGreaterThanOrEqual(5);
  });

  it("keeps unmapped references byte-identical and reports them; unknown id-bearing fields are reported, not rewritten", async () => {
    const b = await buildBackupFixture();
    const gone = "40000000-0000-4000-8000-000000000001";
    const p = prefsOf(b.data);
    p["rules"][0].accountId = gone;
    p["books"]["docLinks"].push({ docId: gone, kind: "transaction", targetId: gone, label: "deleted" });
    p["futureRegister"] = [{ linkedThing: ID.bank }];
    b.data.expenses![4]!["transfer_counterpart_of"] = gone;
    const r = await planRestore(b, OWNER_B);
    const q = prefsOf(r.data);
    expect(q["rules"][0].accountId).toBe(gone);
    expect(q["books"]["docLinks"][4]).toEqual({ docId: gone, kind: "transaction", targetId: gone, label: "deleted" });
    expect(q["futureRegister"]).toEqual([{ linkedThing: ID.bank }]);
    expect(r.data.expenses?.[4]?.["transfer_counterpart_of"]).toBe(gone);
    expect(r.report.unmapped.map((u) => [u.path, u.expected])).toEqual([
      ["finance_preferences[0].data.rules[0].accountId", "accounts"],
      ["finance_preferences[0].data.books.docLinks[4].docId", "documents"],
      ["finance_preferences[0].data.books.docLinks[4].targetId", "expenses"],
      ["expenses[4].transfer_counterpart_of", "expenses"],
    ]);
    expect(r.report.unclassified).toEqual([{ path: "finance_preferences[0].data.futureRegister[0].linkedThing", value: ID.bank }]);
    expect(r.report.verbatim.map((v) => v.path)).toEqual(expect.arrayContaining(["finance_preferences[0].data.preservedRecords", "finance_preferences[0].data.books.savedDrafts"]));
  });
});

describe("same-account restore is byte-identical (R4)", () => {
  it("round-trips through a ZIP and restores with identical ids and JSON", async () => {
    const b = await buildBackupFixture();
    const round = readBackup(createBackupZip(b, fixtureFiles(b)), true);
    expect(round.backup).toEqual(b);
    const r = await planRestore(round.backup, OWNER_A);
    expect(r.report).toMatchObject({ crossAccount: false, remapped: 0, unmapped: [], unclassified: [] });
    expect(JSON.stringify(prefsOf(r.data))).toBe(JSON.stringify(prefsOf(b.data)));
    for (const t of BACKUP_TABLES) expect(JSON.stringify(r.data[t])).toBe(JSON.stringify(b.data[t]));
  });

  it("staging files changes only receipt/document paths", async () => {
    const b = await buildBackupFixture();
    const r = await planRestore(b, OWNER_A, { stageFiles: true });
    expect(JSON.stringify(prefsOf(r.data))).toBe(JSON.stringify(prefsOf(b.data)));
    expect(r.paths.size).toBe(Object.keys(fixtureFiles(b)).length);
    for (const [, next] of r.paths) expect(next).toMatch(new RegExp(`^${OWNER_A}/restored/`));
    const strip = (d: Backup["data"]) => JSON.stringify(d, (k, v: unknown) => (k === "path" || k === "file_path" ? undefined : v));
    expect(strip(r.data)).toBe(strip(b.data));
  });
});

describe("restoring the same backup twice does not duplicate (R4)", () => {
  it("cross-account ids are deterministic per restoring owner", async () => {
    const b = await buildBackupFixture();
    const one = await planRestore(b, OWNER_B, { stageFiles: true }), two = await planRestore(clone(b), OWNER_B, { stageFiles: true });
    for (const t of BACKUP_TABLES) expect(two.data[t]?.map((x) => x["id"])).toEqual(one.data[t]?.map((x) => x["id"]));
    expect(JSON.stringify(prefsOf(two.data))).toBe(JSON.stringify(prefsOf(one.data)));
    const c = "00000000-0000-4000-8000-0000000000c3";
    const other = await planRestore(b, c);
    expect(other.data.accounts?.[0]?.["id"]).not.toBe(one.data.accounts?.[0]?.["id"]);
  });
});

describe("derived postings after a cross-account restore (R12)", () => {
  it("a posted legacy depreciation entry gets the restoring owner's own posting id, and its journal follows", async () => {
    const b = await buildBackupFixture();
    const legacy = await legacyDepreciationId();
    const r = await planRestore(b, OWNER_B);
    const expected = await ownerPostingId(OWNER_B, depreciationEntryKey(ID.laptopAsset, "2026-04"));
    expect(r.data.expenses?.some((e) => e["id"] === legacy)).toBe(false);
    expect(r.data.expenses?.some((e) => e["id"] === expected)).toBe(true);
    expect(prefsOf(r.data)["books"]["journals"][0].transactionId).toBe(expected);
    // Same-account restore never renumbers the stored legacy id.
    const same = await planRestore(b, OWNER_A);
    expect(same.data.expenses?.some((e) => e["id"] === legacy)).toBe(true);
  });
});

describe("legacy backup files (v1/v2) still restore", () => {
  it("v1 JSON without owner, drafts, closure history or investment tables", async () => {
    const full = await buildBackupFixture();
    const keep = ["finance_preferences", "family_members", "accounts", "category_budgets", "expenses", "commitments", "loans", "goals", "asset_valuations", "documents"] as const;
    const v1 = { app: "ledgerline", version: 1, exportedAt: "2025-01-01", data: Object.fromEntries(keep.map((t) => [t, full.data[t]])) };
    const { backup } = readBackup(strToU8(JSON.stringify(v1)), false);
    expect(backup.version).toBe(1);
    const same = await planRestore(backup, OWNER_A);
    expect(same.report.crossAccount).toBe(false);
    expect(JSON.stringify(prefsOf(same.data))).toBe(JSON.stringify(prefsOf(full.data)));
    const cross = await planRestore(backup, OWNER_B, { stageFiles: true });
    expect(cross.data.demat_accounts).toEqual([]);
    expect(cross.data.expense_drafts).toEqual([]);
    expect(cross.report.unmapped).toEqual([]);
    // v1 files have no draft rows; the statement upload's draft link shares its id with the saved entry, so it
    // follows that entry's new id (the only "orphan" is the draft row the old format never contained).
    expect(orphans(cross.data).map((o) => [o.path, o.value === cross.data.expenses?.find((e) => e["title"] === "Groceries")?.["id"]])).toEqual([["finance_preferences[0].data.statementUploads[0].linkedDrafts[0].draftId", true]]);
  });

  it("v2 ZIP without investment tables", async () => {
    const full = await buildBackupFixture();
    const v2: Backup = { ...clone(full), version: 2 };
    delete v2.data.demat_accounts; delete v2.data.security_holdings;
    const { backup, files } = readBackup(createBackupZip(v2, fixtureFiles(v2)), true);
    expect(Object.keys(files).length).toBe(Object.keys(fixtureFiles(v2)).length);
    const r = await planRestore(backup, OWNER_B, { stageFiles: true });
    expect(orphans(r.data)).toEqual([]);
    expect(r.report.unmapped).toEqual([]);
    expect(investmentTablesToWrite(r.data, {})).toEqual([]);
  });

  it("rejects an unknown future format instead of silently dropping its tables", async () => {
    const b = { ...(await buildBackupFixture()), version: 4 };
    expect(() => readBackup(strToU8(JSON.stringify(b)), false)).toThrow("That isn't a Thapal backup");
  });
});

describe("investment tables (R8)", () => {
  it("round-trip with remapped demat link and statement sources", async () => {
    const b = await buildBackupFixture();
    const { backup } = readBackup(createBackupZip(b, fixtureFiles(b)), true);
    expect(backup.data.security_holdings).toEqual(b.data.security_holdings);
    const r = await planRestore(backup, OWNER_B);
    const demat = r.data.demat_accounts?.[0], holding = r.data.security_holdings?.[0];
    const cas = r.data.documents?.find((d) => d["title"] === "CDSL CAS")?.["id"];
    expect(holding?.["demat_id"]).toBe(demat?.["id"]);
    expect(holding?.["sources"]).toEqual([cas]);
    expect((holding?.["events"] as { source: string }[])[0]?.source).toBe(cas);
    expect((holding?.["gains"] as { source: string }[])[0]?.source).toBe(cas);
    expect((holding?.["lots"] as { source: string }[])[0]?.source).toBe(cas);
    const lots = (b.data.security_holdings?.[0]?.["lots"] as Record<string, unknown>[]).map((l) => ({ ...l, source: cas }));
    expect([holding?.["quantity"], holding?.["statement_value"], holding?.["lots"]]).toEqual([10, 29000.5, lots]);
  });

  it("are written by the app only when the server restore did not count them", async () => {
    const r = await planRestore(await buildBackupFixture(), OWNER_B);
    expect(investmentTablesToWrite(r.data, { accounts: 5 })).toEqual(["demat_accounts", "security_holdings"]);
    expect(investmentTablesToWrite(r.data, { demat_accounts: 1, security_holdings: 1 })).toEqual([]);
  });
});
