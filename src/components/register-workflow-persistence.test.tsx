// @vitest-environment node
// Initialise DOM before React's event feature detection; retain Node Blob for PGlite.
vi.hoisted(async () => {
 const { JSDOM } = await import("jsdom");
 const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
 Object.defineProperty(dom.window.File.prototype, "arrayBuffer", { value: function(this: File) { return new Promise<ArrayBuffer>((resolve, reject) => { const r = new dom.window.FileReader(); r.onload = () => resolve(r.result as ArrayBuffer); r.onerror = reject; r.readAsArrayBuffer(this); }); } });
 for (const key of ["window", "document", "HTMLElement", "File", "FileReader"] as const) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === "window" ? dom.window : key === "document" ? dom.window.document : dom.window[key] });
});
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { emptyBooks } from "@/lib/books/types";
import { tenantLedger, rentFor } from "@/lib/books/property";
import { taxComputation } from "@/lib/books/taxcomp";
import { annualBook } from "@/lib/books/depreciation";
import type { Asset } from "@/lib/assets";
import { taxSchedule } from "@/lib/assets";
import { recordProvenance } from "@/lib/books/docrepo";
import { gstr3b } from "@/lib/books/gst";
import type { ExtractedDocument } from "@/lib/document-extract.functions";
import type { VaultDoc } from "@/lib/documents";
const state = vi.hoisted(() => ({ store: {} as Record<string, unknown>, reader: vi.fn() }));
vi.mock("@/lib/store", () => ({ useStore: () => state.store }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => state.reader }));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock("@/lib/document-extract.functions", () => ({ extractDocument: vi.fn() }));
vi.mock("@/lib/books/runs", () => ({ documentIdForRun: (id: string) => id, startRun: async () => ({ data: {} }), updateRun: async () => undefined, closeRun: async () => undefined }));
import { DocumentIntake } from "./DocumentIntake";
const owner = "00000000-0000-0000-0000-000000000001", other = "00000000-0000-0000-0000-000000000002";
const read = (docType: ExtractedDocument["docType"], extra: object): ExtractedDocument => ({ docType, title: "Controlled source", date: "2026-10-02", amount: null, currency: "INR", merchant: null, notes: "", text: "", fields: [], ...extra } as unknown as ExtractedDocument);
const leaseRead = (extra: object = {}) => read("lease_agreement", { fields: [{ label: "Lease start", value: "2026-10-01", page: 1, quote: "Lease starts 2026-10-01", confidence: "high" }, { label: "Rent due day", value: "5", page: 1, quote: "Rent payable by the fifth", confidence: "medium" }, { label: "Payment terms", value: "Bank transfer", page: 2, quote: "Payment by bank transfer", confidence: "high" }], lease: { tenant: "Ramesh Kumar", property: "Factory", unit: null, start: "2026-10-01", end: "2027-09-30", rent: 30000, dueDay: 5, escalationPct: 5, escalationEveryMonths: 6, deposit: 100000, noticeDays: 60, paymentTerms: "Bank transfer", gst: false }, ...extra });
const property = { id: "p1", name: "Factory", address: "44 Industrial Road", buildings: [], docIds: [] };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
async function harness(extracted: ExtractedDocument, extras: object = {}, transactions: object[] = []) {
 const prefs = { books: { ...emptyBooks(), properties: [property] }, entities: [], assets: [] as Asset[], contractObligations: [], ...extras };
 const db = new PGlite();
 try {
      await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
        CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
        CREATE TABLE finance_preferences(owner_id uuid PRIMARY KEY,data jsonb NOT NULL,updated_at timestamptz);
        CREATE TABLE documents(id uuid PRIMARY KEY,owner_id uuid,doc_type text,evidence_locked boolean,original bytea,fields jsonb);
        CREATE TABLE document_runs(owner_id uuid,data jsonb);
        CREATE TABLE expenses(id uuid PRIMARY KEY,employee_id uuid);
        CREATE TABLE accounts(id uuid PRIMARY KEY,owner_id uuid);
        CREATE TABLE loans(id uuid PRIMARY KEY,owner_id uuid);
        CREATE FUNCTION commit_document_intake(uuid,jsonb,boolean) RETURNS void LANGUAGE sql AS $$ SELECT $$;`);
      const docPolicy = readFileSync("drizzle/migrations/0009_prd_modules_cards_loans_docs_audit.sql", "utf8").match(/CREATE POLICY "Own documents"[\s\S]*?\n  \);/)?.[0];
      const prefPolicy = readFileSync("drizzle/migrations/0007_preferences_and_receipt_details.sql", "utf8").split("\n").find(line => line.startsWith('CREATE POLICY "Own finance preferences"'));
      if (!docPolicy || !prefPolicy) throw new Error("Production owner policies missing");
      await db.exec(`ALTER TABLE documents ADD COLUMN transaction_id uuid; ALTER TABLE documents ADD COLUMN account_id uuid; ALTER TABLE documents ADD COLUMN loan_id uuid;
        GRANT SELECT,INSERT,UPDATE,DELETE ON documents,finance_preferences TO authenticated;
        GRANT SELECT ON expenses,accounts,loans TO authenticated;
        ALTER TABLE documents ENABLE ROW LEVEL SECURITY; ALTER TABLE finance_preferences ENABLE ROW LEVEL SECURITY;
        ${docPolicy} ${prefPolicy}`);
      await db.query("INSERT INTO finance_preferences VALUES ($1,$2::jsonb,now()),($3,'{}',now())", [owner, JSON.stringify(prefs), other]);
      for (const file of ["0071_revision_checked_document_intake", "0074_typed_document_intake_validation", "0079_intake_server_approval", "0085_nested_schedule_intake_validation"]) await db.exec(readFileSync(`drizzle/migrations/${file}.sql`, "utf8"));

      await db.query("SELECT set_config('test.uid',$1,false)", [owner]);
      await db.exec("SET ROLE authenticated");
      state.reader.mockResolvedValue({ ok: true, result: extracted });
      const add = vi.fn(async (file: File, meta) => {
        const raw = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsText(file); });
        await db.query("INSERT INTO documents(id,owner_id,doc_type,evidence_locked,original,fields) VALUES ($1,$2,$3,false,$4,$5::jsonb)", [meta.id, owner, meta.docType, new TextEncoder().encode(raw), JSON.stringify(meta.fields)]);
        return meta.id;
      });
      let first = true;
      const commit = vi.fn(async (_doc, payload, lock, attempt) => {
        await db.exec("RESET ROLE");
        await db.query("INSERT INTO document_runs VALUES ($1,$2::jsonb)", [owner, JSON.stringify({ intakeAttempt: attempt })]);
        await db.exec("SET ROLE authenticated");
        await db.query("SELECT commit_document_intake_reviewed($1,$2,$3::jsonb,$4,$5)", [attempt.id, attempt.documentId, JSON.stringify(payload), lock, attempt.expected]);
        if (first) { first = false; throw new Error("Lost response after commit"); }
      });
      const initial = (await db.query<{ revision: number }>("SELECT revision::int FROM finance_preferences WHERE owner_id=$1", [owner])).rows[0];
      state.store = { preferences: prefs, preferencesRevision: initial?.revision, documents: [], accounts: [], loans: [], transactions, addDocument: add, commitDocumentRecords: commit };
      const view = render(<DocumentIntake file={new File(["%PDF-1.4 controlled document source"], "source.pdf", { type: "application/pdf" })} onClose={vi.fn()} />);
      await view.findByRole("button", { name: "Confirm and save" }, { timeout: 10000 });
      expect(state.reader).toHaveBeenCalledWith({ data: expect.objectContaining({ mimeType: "application/pdf", dataUrl: expect.stringContaining("data:application/pdf;base64,") }) });
      const finish = async () => {
        fireEvent.click(view.getByRole("button", { name: "Confirm and save" }));
        await view.findByRole("button", { name: /^Retry$/ }, { timeout: 10000 });
        fireEvent.click(view.getByRole("button", { name: /^Retry$/ }));
        await view.findByText("Saved", {}, { timeout: 10000 });
        expect(add).toHaveBeenCalledTimes(1); expect(commit).toHaveBeenCalledTimes(2);
        expect(commit.mock.calls[1]).toEqual(commit.mock.calls[0]);
        const saved = (await db.query<{ data: typeof prefs }>("SELECT data FROM finance_preferences WHERE owner_id=$1", [owner])).rows[0]?.data;
        const original = (await db.query<{ id: string; fields: VaultDoc["fields"]; original: Uint8Array; evidence_locked: boolean }>("SELECT * FROM documents")).rows[0];
        if (!saved || !original) throw new Error("Missing saved owner records");
        expect(new TextDecoder().decode(original.original)).toBe("%PDF-1.4 controlled document source");
        expect(original.evidence_locked).toBe(true);
        expect((await db.query("SELECT * FROM document_intake_commits")).rows).toHaveLength(1);
        await db.query("SELECT set_config('test.uid',$1,false)", [other]);
        expect((await db.query("SELECT * FROM documents")).rows).toEqual([]);
        expect((await db.query("SELECT * FROM finance_preferences WHERE owner_id=$1", [owner])).rows).toEqual([]);
        expect((await db.query("SELECT * FROM document_intake_commits")).rows).toEqual([]);
        await expect(db.query("INSERT INTO documents(id,owner_id,doc_type,evidence_locked) VALUES ($1,$2,'other',false)", [crypto.randomUUID(), owner])).rejects.toThrow(/row-level security/);
        await db.exec("RESET ROLE; SET ROLE anon");
        await expect(db.query("SELECT * FROM documents")).rejects.toThrow(/permission denied/);
        await db.exec("RESET ROLE; SET ROLE authenticated");
        await db.query("SELECT set_config('test.uid',$1,false)", [owner]);
        return { saved, original };
      };
      return { db, view, add, commit, finish };
 } catch (e) { await db.close(); throw e; }
}
describe("grouped actual file-to-review, installed SQL and read-back acceptance", () => {
 it("ambiguous property names require owner selection before any lease record or original is saved", async () => {
  const h = await harness(leaseRead(), { books: { ...emptyBooks(), properties: [property, { ...property, id: "p2", address: "Other Road" }] } });
  try {
   expect(h.view.getByLabelText("Property for this lease")).toHaveValue("");
   fireEvent.click(h.view.getByRole("button", { name: "Confirm and save" }));
   await new Promise(resolve => setTimeout(resolve, 40));
   expect(h.add).not.toHaveBeenCalled(); expect(h.commit).not.toHaveBeenCalled();
   fireEvent.change(h.view.getByLabelText("Property for this lease"), { target: { value: "p2" } });
   const { saved } = await h.finish();
   expect(saved.books.leases[0]?.propertyId).toBe("p2");
   expect(saved.books.docLinks.filter(l => l.kind === "property").map(l => l.targetId)).toEqual(["p2"]);
  } finally { await h.db.close(); }
 }, 30000);
 it("lease period, due date, payment terms and GST flag persist without manual duplication and feed rent/tax working", async () => {
  const h = await harness(leaseRead());
  try {
   const { saved, original } = await h.finish();
   const lease = saved.books.leases[0]; if (!lease) throw new Error("Lease missing");
   expect(lease).toMatchObject({ propertyId: "p1", tenant: "Ramesh Kumar", start: "2026-10-01", end: "2027-09-30", rent: 30000, dueDay: 5, paymentTerms: "Bank transfer", gst: false, deposit: 100000 });
   expect(rentFor(lease, "2026-09")).toBe(0); expect(rentFor(lease, "2027-04")).toBe(31500); expect(rentFor(lease, "2027-10")).toBe(0);
   const receipts = [{ id: "rent1", date: "2026-10-05", amount: 30000, text: "Ramesh Kumar rent" }, { id: "deposit", date: "2026-10-01", amount: 100000, text: "Ramesh Kumar refundable deposit" }];
   expect(tenantLedger(lease, property, receipts, ["2026-10"], { leases: saved.books.leases, properties: saved.books.properties })[0]).toMatchObject({ rent: 30000, deposit: 100000, balance: 0, status: "paid" });
   const c = taxComputation("2026-27", receipts.map(r => ({ id: r.id, date: r.date, amount: r.amount, title: r.text, txnType: "income", category: "Rent", description: "", scope: "personal" })) as never, [], saved.books.leases, [], []);
   expect(c.houseProperty).toMatchObject({ rent: 30000, standardDeduction: 9000, net: 21000 });
   expect(recordProvenance(lease.id, saved.books.docLinks, [{ ...original, title: "Lease source", docType: "lease_agreement" } as unknown as VaultDoc])[0]?.fields).toEqual(expect.arrayContaining([expect.objectContaining({ label: "Payment terms", value: "Bank transfer", where: "page 2" })]));
  } finally { await h.db.close(); }
 }, 30000);
 it("direct lease-source correction updates approved records while first printed values remain accessible", async () => {
  const h = await harness(leaseRead());
  try {
   fireEvent.click(h.view.getByText(/Details read/));
   fireEvent.change(h.view.getByLabelText(/Rent due day/), { target: { value: "8" } });
   fireEvent.change(h.view.getByLabelText(/Payment terms/), { target: { value: "NEFT only" } });
   const { saved, original } = await h.finish();
   expect(saved.books.leases[0]).toMatchObject({ dueDay: 8, paymentTerms: "NEFT only" });
   expect(original.fields).toEqual(expect.arrayContaining([expect.objectContaining({ label: "Rent due day", value: "8", originalValue: "5", status: "corrected", confidence: "medium" }), expect.objectContaining({ label: "Payment terms", value: "NEFT only", originalValue: "Bank transfer" })]));
  } finally { await h.db.close(); }
 }, 30000);
 it.each([false, true])("invoice-derived asset retains existing payment link; ambiguity=%s never invents a payment", async (ambiguous) => {
  const payment = { id: "paid1", date: "2026-10-02", amount: 150000, title: "Engineering Works generator", merchant: "Engineering Works", txnType: "expense" };
  const h = await harness(read("asset_invoice", { asset: { name: "Generator", kind: "machinery", owner: null, cost: 150000, purchaseDate: "2026-10-02", putToUseOn: "2026-10-02", usefulLifeYears: 10, residualPct: 0, supplier: "Engineering Works", serial: "GEN-NEW", warrantyUntil: "2027-10-02", insurance: "Policy ENG-44" } }), {}, ambiguous ? [payment, { ...payment, id: "paid2" }] : [payment]);
  try {
   fireEvent.change(h.view.getByLabelText("Useful life"), { target: { value: "10" } });
   fireEvent.change(h.view.getByLabelText("Residual value"), { target: { value: "0" } });
   const approval = h.view.getByLabelText(/Capitalise this as a fixed asset/);
   fireEvent.click(approval);
   const { saved, original } = await h.finish();
   const asset = saved.assets[0]; if (!asset) throw new Error("Missing acquisition asset");
   expect(asset).toMatchObject({ cost: 150000, supplier: "Engineering Works", warrantyUntil: "2027-10-02", insurance: "Policy ENG-44" });
   expect(asset.transactionId).toBe(ambiguous ? undefined : "paid1");
   expect(saved.books.docLinks.filter(l => l.kind === "transaction")).toEqual(ambiguous ? [] : [{ docId: original.id, kind: "transaction", targetId: "paid1", label: "acquisition payment" }]);
   expect(saved.books.journals).toEqual([]);
   expect(annualBook(asset, "2026-27").depreciation).toBe(7459.68);
   expect(taxSchedule(asset, "2026-27")[0]?.depreciation).toBe(22500);
  } finally { await h.db.close(); }
 }, 30000);
 it.each(["same", "party", "direction", "year"] as const)("GST invoice identity preserves unrelated saved records (%s) through review, SQL and report read-back", async (variant) => {
  const gstin = "33AAACA1234A1Z5";
  const previous = { id: "previous-invoice", gstin, kind: "sales" as const, party: "Customer One", partyGstin: "", number: "INV-44", date: "2026-10-02", taxable: 1000, igst: 0, cgst: 90, sgst: 90, cess: 0, docId: "older-original" };
  const company = { id: "company", name: "Owner", kind: "company", pan: "AAACA1234A", gstins: [gstin], booksFrom: "2020-21" };
  const invoice = { number: "INV-44", date: variant === "year" ? "2027-04-01" : "2026-10-02", seller: variant === "direction" ? "Customer One" : "Owner", sellerGstin: variant === "direction" ? null : gstin, buyer: variant === "direction" ? "Owner" : variant === "party" ? "Customer Two" : "Customer One", buyerGstin: variant === "direction" ? gstin : null, taxable: 2000, igst: 0, cgst: 180, sgst: 180, cess: 0 };
  const h = await harness(read("invoice", { gstInvoice: invoice }), { books: { ...emptyBooks(), properties: [property], gstInvoices: [previous] }, entities: [company] });
  try {
   const { saved, original } = await h.finish();
   expect(saved.books.gstInvoices).toHaveLength(variant === "same" ? 1 : 2);
   const current = saved.books.gstInvoices.find(i => i.docId === original.id);
   expect(current).toMatchObject({ kind: variant === "direction" ? "purchase" : "sales", taxable: 2000 });
   expect(current?.id).toBe(variant === "same" ? previous.id : original.id);
   if (variant !== "same") expect(saved.books.gstInvoices).toContainEqual(previous);
   const result = gstr3b(saved.books.gstInvoices, gstin, "2026-10");
   expect(result.outwardTaxable).toBe(variant === "same" ? 2000 : variant === "party" ? 3000 : 1000);
   expect(result.outputTax).toBe(variant === "same" ? 360 : variant === "party" ? 540 : 180);
   expect(result.itcClaimed).toBe(variant === "direction" ? 360 : 0);
   expect(saved.books.docLinks).toContainEqual({ docId: original.id, kind: "gst", targetId: current?.id, label: "INV-44" });
  } finally { await h.db.close(); }
 }, 30000);
});
