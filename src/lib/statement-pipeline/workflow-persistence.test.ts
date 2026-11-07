// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, expect, it } from "vitest";
import { buildPlan } from "./plan";
import { applyUpload, originalId, PartialUploadError, type ApplyApi } from "./apply";
import { fromStatementLines, type StmtFile } from "./line";
import { savedBalanceCheck } from "./summary";
import { accountBalance, cashflow, type Account } from "../ledger";
import { buildReportDoc, emptyFilters } from "../report-centre";
import type { Expense } from "../expenses";

// Exercises canonical pipeline against real disposable persistence. The adapter is a test-only
// store boundary, NOT a substitute for testing the production store/RPC or hosted permissions.
let db: PGlite;
const account: Account = { id: "bank", name: "Controlled bank", kind: "savings", openingBalance: 1000, archived: false };
const file: StmtFile = { name: "controlled.csv", accountId: "bank", hint: null, currency: "INR", opening: 1000, closing: 270,
  lines: fromStatementLines("controlled.csv", [{ ref: "a", date: "2026-10-02", description: "SWIGGY ORDER", amount: 250 }, { ref: "b", date: "2026-10-03", description: "AMAZON PURCHASE", amount: 480 }]) };
beforeEach(async () => { db = new PGlite(); await db.exec("CREATE TABLE controlled_ledger(id text PRIMARY KEY, data jsonb NOT NULL); CREATE TABLE controlled_documents(id text PRIMARY KEY, original text NOT NULL);"); });
afterEach(async () => { await db.close(); });
async function entries() { return (await db.query<{ data: Expense }>("SELECT data FROM controlled_ledger ORDER BY id")).rows.map(r => r.data); }

it("partial persistence, retry, source retention, reconciliation and report all agree on two source lines", async () => {
  const plan = buildPlan([file], [account], [], [{ name: "Food", archived: false }, { name: "Other", archived: false }]);
  const reviewed = plan.accounts[0];
  if (!reviewed) throw new Error("Missing statement plan");
  const decisions = [...reviewed.auto, ...reviewed.ask];
  expect(decisions).toHaveLength(2);
  let loseResponse = true;
  const api: ApplyApi = {
    transactions: [], save: async (input, options) => {
      const id = options?.createId;
      if (!id) throw new Error("Missing stable source identity");
      const record = { ...input, id, originalAmount: input.amount, currency: "INR", fxRate: 1, receipts: [], splits: [], reconciledAt: null, statementRef: null };
      await db.query("INSERT INTO controlled_ledger VALUES($1,$2::jsonb) ON CONFLICT(id) DO NOTHING", [id, JSON.stringify(record)]);
      if (loseResponse) { loseResponse = false; throw new Error("Lost response after first saved line"); }
    },
    refresh: async () => {}, reconcile: async () => {}, remove: async () => {},
    addAccount: async () => { throw new Error("Unexpected account creation"); }, setArchived: async () => {},
  };
  const requests = [{ account: reviewed, decisions, reconcileIds: [] }];
  await expect(applyUpload(requests, api)).rejects.toThrow(/Lost response/);
  expect(await entries()).toHaveLength(1);
  await applyUpload(requests, api); await applyUpload(requests, api);
  const saved = await entries();
  expect(saved).toHaveLength(2);
  expect(saved.map(e => e.amount).sort((a,b) => a-b)).toEqual([250,480]);
  await db.query("INSERT INTO controlled_documents VALUES ($1,$2) ON CONFLICT(id) DO NOTHING", ["original-1", "Date,Debit\n2026-10-02,250\n2026-10-03,480"]);
  expect((await db.query("SELECT * FROM controlled_documents")).rows).toHaveLength(1);
  const reconciled = buildPlan([file], [account], saved, [{ name: "Food", archived: false }, { name: "Other", archived: false }]).accounts[0];
  expect(reconciled?.matched).toHaveLength(2);
  expect(reconciled?.ask).toHaveLength(0);
  expect(savedBalanceCheck(reviewed, decisions.map(d => d.line)).result).toBe("matched");
  expect(accountBalance(account, saved)).toBe(270);
  expect(cashflow(saved)).toEqual({ income: 0, spent: 730, net: -730 });
  const report = buildReportDoc("monthly", emptyFilters("2026-10-01", "2026-10-31"), { transactions: saved, accounts: [account], valuations: [], commitments: [], loans: [], budgets: {}, trips: [], drafts: [], memberName: () => "Me", accountName: () => "Controlled bank", today: "2026-10-31" });
  expect(report.summary.find(row => row[0] === "Total expenses")?.[1]).toBe("INR 730.00");
  expect(report.summary.find(row => row[0] === "Available balances (today)")?.[1]).toBe("INR 270.00");
}, 20000);

it("durable original precedes every post; interrupted source-link retries retain one document, exact figures and traceable rows", async () => {
 const reviewed = buildPlan([file], [account], [], [{ name: "Food", archived: false }, { name: "Other", archived: false }]).accounts[0];
 if (!reviewed) throw Error("Missing account plan");
 const bytes = new TextEncoder().encode("Date,Debit\n2026-10-02,250\n2026-10-03,480");
 const documentId = await originalId("owner-a", bytes.buffer);
 expect(await originalId("owner-a", bytes.buffer)).toBe(documentId);
 expect(await originalId("owner-b", bytes.buffer)).not.toBe(documentId);
 let sourceFailure = true, linkFailure = true;
 const api: ApplyApi = {
  transactions: [], prepareSource: async (_request, accountId) => {
   expect(accountId).toBe("bank");
   if (sourceFailure) { sourceFailure = false; throw Error("Private storage unavailable"); }
   await db.query("INSERT INTO controlled_documents VALUES($1,$2) ON CONFLICT(id) DO NOTHING", [documentId, new TextDecoder().decode(bytes)]);
   return documentId;
  }, save: async (input, opts) => {
   expect((await db.query("SELECT id FROM controlled_documents WHERE id=$1", [documentId])).rows).toHaveLength(1);
   const record = { ...input, id: opts?.createId, originalAmount: input.amount, fxRate: 1, receipts: [], splits: [], reconciledAt: null, statementRef: null };
   await db.query("INSERT INTO controlled_ledger VALUES($1,$2::jsonb) ON CONFLICT(id) DO NOTHING", [opts?.createId, JSON.stringify(record)]);
  }, reconcile: async (id, ref) => {
   if (linkFailure) { linkFailure = false; throw Error("Link response interrupted"); }
   await db.query("UPDATE controlled_ledger SET data=data || $2::jsonb WHERE id=$1", [id, JSON.stringify({ statementRef: ref, reconciledAt: "2026-11-07T10:00:00Z" })]);
  }, refresh: async () => {}, remove: async () => {}, addAccount: async () => { throw Error("Unexpected account"); }, setArchived: async () => {},
 };
 const requests = [{ account: reviewed, decisions: [...reviewed.auto, ...reviewed.ask], reconcileIds: [] }];
 await expect(applyUpload(requests, api)).rejects.toThrow("Private storage unavailable");
 expect(await entries()).toHaveLength(0);
 try { await applyUpload(requests, api); throw Error("Expected interrupted link"); }
 catch (error) { expect(error).toBeInstanceOf(PartialUploadError); if (error instanceof PartialUploadError) expect(error.result.posted).toHaveLength(1); }
 await applyUpload(requests, api); await applyUpload(requests, api);
 const saved = await entries(); expect(saved).toHaveLength(2);
 for (const entry of saved) {
  expect(entry.statementRef).toContain(`document:${documentId}`);
  const source = (await db.query<{ original: string }>("SELECT original FROM controlled_documents WHERE id=$1", [entry.statementRef?.split(" · ")[0]?.replace("document:", "")])).rows[0];
  expect(source?.original).toContain(entry.originalAmount.toString());
 }
 expect((await db.query("SELECT * FROM controlled_documents")).rows).toHaveLength(1);
 expect(accountBalance(account, saved)).toBe(270); expect(cashflow(saved).spent).toBe(730);
 const report = buildReportDoc("monthly", emptyFilters("2026-10-01", "2026-10-31"), { transactions: saved, accounts: [account], valuations: [], commitments: [], loans: [], budgets: {}, trips: [], drafts: [], memberName: () => "Me", accountName: () => account.name, today: "2026-10-31" });
 expect(report.summary.find(row => row[0] === "Total expenses")?.[1]).toBe("INR 730.00");
}, 20000);

it("account creation survives a later failure so an accepted-plan retry reuses the returned account", async () => {
 const reviewed = buildPlan([{ ...file, accountId: null, hint: { name: "New bank", issuer: "Bank", kind: "savings", lastFour: "1234" } }], [], [], [{ name: "Food", archived: false }]).accounts[0];
 if (!reviewed) throw Error("Missing new-account plan");
 let created = 0, unavailable = true;
 const api: ApplyApi = { transactions: [], save: async () => {}, reconcile: async () => {}, remove: async () => {}, refresh: async () => {}, setArchived: async () => {}, addAccount: async () => { created++; return "created-bank"; }, prepareSource: async () => { if (unavailable) { unavailable = false; throw Error("Store interrupted"); } return "original"; } };
 const request = [{ account: reviewed, decisions: [...reviewed.auto, ...reviewed.ask], reconcileIds: [] }];
 await expect(applyUpload(request, api)).rejects.toThrow("Store interrupted");
 expect(reviewed.accountId).toBe("created-bank"); await applyUpload(request, api); expect(created).toBe(1);
});