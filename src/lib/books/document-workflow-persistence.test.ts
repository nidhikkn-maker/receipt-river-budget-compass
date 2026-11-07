// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it } from "vitest";
import { commitIntake, type Confirmed, type PrefsSlice } from "./commit";
import { emptyBooks } from "./types";
import { proposeGstInvoice, proposeProperty, proposeAsset } from "./intake";
import { docsFor, recordProvenance } from "./docrepo";
import { gstr3b } from "./gst";
import { toObligations } from "../contracts";
import { accountBalance, cashflow } from "../ledger";
import type { DocType, VaultDoc } from "../documents";

// Real application proposal + commit payload goes through the installed PostgreSQL functions.
// Never connects to Cloud. Every case gets a fresh database and explicit role checks.
let db: PGlite;
const owner = "00000000-0000-0000-0000-000000000001";
const other = "00000000-0000-0000-0000-000000000002";
const docId = "00000000-0000-0000-0000-000000000003";
const op = "00000000-0000-0000-0000-000000000004";
const gstin = "33AAACA1234A1Z5";
const blank = (): PrefsSlice => ({ entities: [], assets: [], books: emptyBooks() });
beforeEach(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE TABLE finance_preferences(owner_id uuid PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz);
    CREATE TABLE documents(id uuid PRIMARY KEY,owner_id uuid,doc_type text,evidence_locked boolean);
    CREATE TABLE document_runs(owner_id uuid,data jsonb);
    CREATE FUNCTION commit_document_intake(uuid,jsonb,boolean) RETURNS void LANGUAGE sql AS $$ SELECT $$;
    INSERT INTO finance_preferences VALUES ('${owner}','{}',now()),('${other}','{}',now());
    INSERT INTO documents VALUES ('${docId}','${owner}','other',false);`);
  for (const file of ["0071_revision_checked_document_intake", "0074_typed_document_intake_validation", "0079_intake_server_approval", "0085_nested_schedule_intake_validation"]) {
    await db.exec(readFileSync(`drizzle/migrations/${file}.sql`, "utf8"));
  }
  await db.exec(`SELECT set_config('test.uid','${owner}',false)`);
}, 20000);
afterEach(async () => { await db.close(); });

async function prepare(type: DocType, confirmed: Confirmed, extra: object = {}, previous = blank()) {
  await db.query("UPDATE documents SET doc_type=$1 WHERE id=$2", [type, docId]);
  const next = commitIntake(previous, confirmed, { id: docId, title: "Reviewed original", docType: type, fieldLabels: ["Total"] }, "2026-11-07", () => crypto.randomUUID());
  const payload = { ...next, ...extra };
  const expected = (await db.query<{ revision: number }>("SELECT revision::int FROM finance_preferences WHERE owner_id=$1", [owner])).rows[0]?.revision;
  if (expected === undefined) throw new Error("Owner missing");
  const lock = confirmed.route !== "document";
  await db.query("INSERT INTO document_runs VALUES ($1,$2::jsonb)", [owner, JSON.stringify({ intakeAttempt: { id: op, documentId: docId, data: payload, lock, expected } })]);
  const save = () => db.query("SELECT commit_document_intake_reviewed($1,$2,$3::jsonb,$4,$5)", [op, docId, JSON.stringify(payload), lock, expected]);
  return { payload, save, expected };
}
async function readBack() {
  const row = (await db.query<{ data: PrefsSlice & { contractObligations?: ReturnType<typeof toObligations> }; revision: number }>("SELECT data,revision::int FROM finance_preferences WHERE owner_id=$1", [owner])).rows[0];
  if (!row) throw new Error("No persisted owner records");
  return row;
}

it("contract reviewed obligations persist once after a lost response, remain unpaid, and audit is owner-only", async () => {
  const obligations = toObligations(docId, [{ label: "Annual service", amount: 12000, frequency: "yearly", dueDate: "2027-10-01", noticeDays: 30, evidence: "Annual service fee INR 12,000" }], () => crypto.randomUUID());
  const request = await prepare("contract", { route: "document" }, { contractObligations: obligations });
  await request.save(); // response lost: client replays after its run has disappeared
  await db.exec("DELETE FROM document_runs");
  await request.save();
  const saved = await readBack();
  expect(saved.revision).toBe(request.expected + 1);
  expect(saved.data.contractObligations).toEqual(obligations);
  expect(saved.data.contractObligations?.[0]?.status).toBe("review");
  expect(saved.data.books.gstInvoices).toEqual([]);
  await db.exec("SET ROLE authenticated");
  expect((await db.query("SELECT * FROM document_intake_commits")).rows).toHaveLength(1);
  await db.exec(`SELECT set_config('test.uid','${other}',false)`);
  expect((await db.query("SELECT * FROM document_intake_commits")).rows).toHaveLength(0);
}, 20000);

it("receipt storage commit changes no financial register and does not manufacture missing values", async () => {
  const request = await prepare("receipt", { route: "document" });
  await request.save();
  expect((await readBack()).data).toEqual(request.payload);
  expect((await db.query<{ locked: boolean }>("SELECT evidence_locked locked FROM documents")).rows[0]?.locked).toBe(false);
  expect((await readBack()).data.books.holdings).toEqual([]);
}, 20000);

it("utility bill persists consumer identity and property-source link without invented acquisition cost or assets", async () => {
  const proposal = proposeProperty({ name: "Factory", address: "44 Industrial Road", owner: null, cost: null, acquiredOn: null, surveyNo: null, valuation: null, valuationDate: null, utilityConsumerNo: "04477112" }, [], "property-1", docId);
  const request = await prepare("utility_bill", { route: "property", property: proposal.property, asset: null });
  await request.save();
  const saved = await readBack();
  expect(saved.data.books.properties[0]?.notes).toBe("Consumer 04477112");
  expect(saved.data.assets).toEqual([]);
  expect(docsFor(saved.data.books.docLinks, "property", "property-1")).toEqual([docId]);
}, 20000);

it("maintenance invoice links the reviewed asset and source; it never posts depreciation or spends twice", async () => {
  const { asset } = proposeAsset({ name: "Generator", kind: "machinery", cost: 150000, purchaseDate: "2026-04-01", putToUseOn: "2026-04-02", usefulLifeYears: 15, residualPct: 5, owner: null, supplier: "Engineering Works", warrantyUntil: null, insurance: null, serial: "GEN-44" }, [], "asset-1", docId);
  if (!asset) throw new Error("Representative asset missing");
  const request = await prepare("maintenance", { route: "asset", asset });
  await request.save(); await request.save();
  const saved = await readBack();
  expect(saved.data.assets).toHaveLength(1);
  expect(saved.data.books.assetEvents).toHaveLength(1);
  expect(saved.data.books.assetEvents[0]).toMatchObject({ kind: "received", docId });
  expect(docsFor(saved.data.books.docLinks, "asset", "asset-1")).toEqual([docId]);
  expect(cashflow([])).toEqual({ income: 0, spent: 0, net: 0 });
}, 20000);

it("invoice source → reviewed GST commit → reloaded liability agrees while its payment is counted once", async () => {
  const { invoice } = proposeGstInvoice({ number: "INV-44", date: "2026-10-02", seller: "Owner company", sellerGstin: gstin, buyer: "Customer", buyerGstin: "29ABCDE1234F1Z5", taxable: 10000, igst: 1800, cgst: 0, sgst: 0, cess: 0 }, [gstin], "invoice-1", docId);
  if (!invoice) throw new Error("Representative invoice missing");
  const request = await prepare("invoice", { route: "gst", invoice });
  await request.save(); await request.save();
  const saved = await readBack();
  expect(saved.data.books.gstInvoices).toHaveLength(1);
  expect(gstr3b(saved.data.books.gstInvoices, gstin, "2026-10")).toMatchObject({ outwardTaxable: 10000, outputTax: 1800, netPayable: 1800 });
  const evidence = { id: docId, fields: [{ label: "Taxable value", value: "10000", originalValue: "10000", quote: "Taxable value INR 10,000", page: 1, confidence: "high", status: "confirmed" }] } as VaultDoc;
  expect(recordProvenance("invoice-1", saved.data.books.docLinks, [evidence])[0]?.fields[0]).toMatchObject({ value: "10000", printed: null, where: "page 1" });
  // The tax register is evidence, not a second ledger: report reads the saved movement only.
  const movement = [{ id: "paid-1", amount: 11800, txnType: "income" as const, accountId: "bank", date: "2026-10-03" }];
  expect(cashflow(movement)).toEqual({ income: 11800, spent: 0, net: 11800 });
  expect(accountBalance({ id: "bank", name: "Bank", kind: "current", openingBalance: 0, archived: false }, movement)).toBe(11800);
  await db.exec(`SELECT set_config('test.uid','${other}',false)`);
  await expect(request.save()).rejects.toThrow(/operation ID already used/);
}, 20000);

it("database rejection rolls back preferences, evidence lock and audit together; corrected retry succeeds", async () => {
  const { invoice } = proposeGstInvoice({ number: "INV-44", date: "2026-10-02", seller: "Owner", sellerGstin: gstin, buyer: "Customer", buyerGstin: null, taxable: 10000, igst: 0, cgst: 900, sgst: 900, cess: 0 }, [gstin], "invoice-1", docId);
  if (!invoice) throw new Error("Missing invoice");
  const request = await prepare("invoice", { route: "gst", invoice });
  const invalid = { ...request.payload, books: { ...request.payload.books, gstInvoices: [{ ...invoice, taxable: "10000" }] } };
  await db.query("UPDATE document_runs SET data=$1", [JSON.stringify({ intakeAttempt: { id: op, documentId: docId, expected: request.expected, lock: true, data: invalid } })]);
  await expect(db.query("SELECT commit_document_intake_reviewed($1,$2,$3::jsonb,true,$4)", [op, docId, JSON.stringify(invalid), request.expected])).rejects.toThrow(/taxable/);
  expect((await readBack()).data).toEqual({});
  expect((await db.query("SELECT * FROM document_intake_commits")).rows).toHaveLength(0);
  expect((await db.query<{ locked: boolean }>("SELECT evidence_locked locked FROM documents")).rows[0]?.locked).toBe(false);
  await db.query("UPDATE document_runs SET data=$1", [JSON.stringify({ intakeAttempt: { id: op, documentId: docId, expected: request.expected, lock: true, data: request.payload } })]);
  await request.save();
  expect((await readBack()).data.books.gstInvoices[0]?.taxable).toBe(10000);
}, 20000);