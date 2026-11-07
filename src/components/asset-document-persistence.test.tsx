// @vitest-environment node
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { taxSchedule } from "@/lib/assets";
import { annualBook } from "@/lib/books/depreciation";
import { emptyBooks } from "@/lib/books/types";
const state = vi.hoisted(() => ({ store: {} as Record<string, unknown> }));
vi.mock("@/lib/store", () => ({ useStore: () => state.store }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock("@/lib/document-extract.functions", () => ({ extractDocument: vi.fn() }));
vi.mock("@/lib/books/runs", () => ({ documentIdForRun: (id: string) => id, startRun: vi.fn(), updateRun: vi.fn(), closeRun: vi.fn() }));
import { DocumentIntake } from "./DocumentIntake";
import type { ExtractedDocument } from "@/lib/document-extract.functions";
const baseRead = (docType: ExtractedDocument["docType"], overrides: Partial<ExtractedDocument> = {}): ExtractedDocument => ({ docType, title: "Controlled original", date: "2026-10-02", amount: null, currency: "INR", merchant: null, notes: "", text: "", fields: [], ...overrides } as ExtractedDocument);
const open = (read: ExtractedDocument) => render(<DocumentIntake file={new File(["representative original"], "controlled.pdf", { type: "application/pdf" })} onClose={vi.fn()} resume={{ runId: "00000000-0000-0000-0000-000000000010", read, docType: read.docType, fields: read.fields.map(f => ({ ...f, status: "read" as const })), data: {} }} />);
describe("connected asset document review and installed database", () => {
  const add = vi.fn(), commit = vi.fn();
  beforeEach(() => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
    vi.stubGlobal("document", dom.window.document); vi.stubGlobal("HTMLElement", dom.window.HTMLElement); vi.stubGlobal("File", dom.window.File);
    state.store['testWindow'] = dom.window;
    vi.clearAllMocks();
    state.store = { preferences: { books: emptyBooks(), entities: [], assets: [], contractObligations: [] }, documents: [], accounts: [], loans: [], transactions: [], addDocument: add, commitDocumentRecords: commit };
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  it.each(["maintenance", "warranty"] as const)("%s review → installed SQL → reload retains source, tax and book values through lost response and permission denial", async (type) => {
    const owner = "00000000-0000-0000-0000-000000000001", other = "00000000-0000-0000-0000-000000000002";
    const docId = "00000000-0000-0000-0000-000000000010";
    const asset = { id: "generator-1", name: "Generator", kind: "machinery" as const, cost: 150000, inUse: "2026-04-01", purchaseDate: "2026-04-01", sharePct: 100, bookMethod: "slm" as const, bookRatePct: 10, tag: "GEN-44", usefulLifeYears: 10, residualPct: 0, docId: "purchase-original", accountId: "asset-account" };
    const prefs = { books: emptyBooks(), entities: [], assets: [asset], contractObligations: [] };
    const db = new PGlite();
    try {
      await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
        CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
        CREATE TABLE finance_preferences(owner_id uuid PRIMARY KEY,data jsonb NOT NULL,updated_at timestamptz);
        CREATE TABLE documents(id uuid PRIMARY KEY,owner_id uuid,doc_type text,evidence_locked boolean,original bytea,fields jsonb);
        CREATE TABLE document_runs(owner_id uuid,data jsonb);
        CREATE FUNCTION commit_document_intake(uuid,jsonb,boolean) RETURNS void LANGUAGE sql AS $$ SELECT $$;`);
      await db.query("INSERT INTO finance_preferences VALUES ($1,$2::jsonb,now()),($3,'{}',now())", [owner, JSON.stringify(prefs), other]);
      for (const file of ["0071_revision_checked_document_intake", "0074_typed_document_intake_validation", "0079_intake_server_approval", "0085_nested_schedule_intake_validation"]) await db.exec(readFileSync(`drizzle/migrations/${file}.sql`, "utf8"));
      await db.query("SELECT set_config('test.uid',$1,false)", [owner]);
      const row = (await db.query<{ revision: number }>("SELECT revision::int FROM finance_preferences WHERE owner_id=$1", [owner])).rows[0];
      if (!row) throw new Error("Owner absent");
      vi.stubGlobal("window", state.store['testWindow']);
      let approved: { id: string; documentId: string; expected: number; data: unknown; lock: boolean } | undefined;
      add.mockImplementation(async (_file: File, meta) => {
        await db.query("INSERT INTO documents VALUES ($1,$2,$3,false,$4,$5::jsonb)", [meta.id, owner, meta.docType, new TextEncoder().encode("representative original"), JSON.stringify(meta.fields)]);
        return meta.id;
      });
      commit.mockImplementation(async (_doc: string, payload, lock: boolean, attempt) => {
        approved = attempt;
        await db.query("INSERT INTO document_runs VALUES ($1,$2::jsonb)", [owner, JSON.stringify({ intakeAttempt: attempt })]);
        await db.query("SELECT commit_document_intake_reviewed($1,$2,$3::jsonb,$4,$5)", [attempt.id, docId, JSON.stringify(payload), lock, attempt.expected]);
        if (commit.mock.calls.length === 1) throw new Error("Response lost after database commit");
      });
      state.store['preferences'] = prefs; state.store['preferencesRevision'] = row.revision;
      const view = open(baseRead(type, { amount: 8000, notes: "Annual service checked", fields: [{ label: "Serial number", value: "GEN-44", originalValue: "GEN-44", page: 1, quote: "Serial GEN-44", confidence: "high" }], asset: { name: "Generator service", kind: "machinery", cost: 8000, purchaseDate: "2026-10-02", supplier: "Engineering Works", owner: null, warrantyUntil: null, insurance: null, serial: "GEN-44", putToUseOn: null, method: null, usefulLifeYears: null, residualPct: null, openingTaxWdv: null, openingBookWdv: null, wdvFy: null } }));
      expect(view.getByLabelText("Asset for this document")).toHaveValue(asset.id);
      fireEvent.click(view.getByRole("button", { name: "Confirm and save" }));
      await view.findByRole("button", { name: "Retry" }, { timeout: 10000 });
      fireEvent.click(view.getByRole("button", { name: "Retry" }));
      await view.findByText("Saved", {}, { timeout: 10000 });
      expect(add).toHaveBeenCalledTimes(1);
      const saved = (await db.query<{ data: typeof prefs }>("SELECT data FROM finance_preferences WHERE owner_id=$1", [owner])).rows[0]?.data;
      if (!saved || !approved) throw new Error("No persisted review");
      expect(saved.assets).toEqual([{ ...asset, docIds: [docId] }]);
      expect(saved.books.docLinks).toContainEqual({ docId, kind: "asset", targetId: asset.id, label: asset.name });
      expect(saved.books.assetEvents).toHaveLength(type === "maintenance" ? 1 : 0);
      expect(saved.books.journals).toEqual([]);
      expect(annualBook(saved.assets[0] ?? asset, "2026-27")).toMatchObject({ depreciation: 15000, nbv: 135000 });
      expect(taxSchedule(saved.assets[0] ?? asset, "2026-27")[0]).toMatchObject({ depreciation: 22500, closing: 127500 });
      const original = (await db.query<{ original: Uint8Array; fields: unknown[]; evidence_locked: boolean }>("SELECT original,fields,evidence_locked FROM documents WHERE id=$1", [docId])).rows[0];
      expect(new TextDecoder().decode(original?.original)).toBe("representative original");
      expect(original?.fields).toEqual([expect.objectContaining({ page: 1, quote: "Serial GEN-44", originalValue: "GEN-44" })]);
      expect(original?.evidence_locked).toBe(true);
      await db.exec("SET ROLE authenticated");
      expect((await db.query("SELECT * FROM document_intake_commits")).rows).toHaveLength(1);
      await db.query("SELECT set_config('test.uid',$1,false)", [other]);
      expect((await db.query("SELECT * FROM document_intake_commits")).rows).toHaveLength(0);
      await expect(db.query("SELECT commit_document_intake_reviewed($1,$2,$3::jsonb,$4,$5)", [approved.id, docId, JSON.stringify(approved.data), approved.lock, approved.expected])).rejects.toThrow(/operation ID already used/);
    } finally { await db.close(); }
  }, 30000);
});
