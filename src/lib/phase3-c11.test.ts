// Phase 3: KK decision C11 (release blocker RB-DEC-C11) and the app-side wiring of the proposed P7 posting
// layer. C11: every automatically classified statement row needs its own explicit approval before it is
// saved; batch saving of individually approved rows is allowed; no unchecked "Apply everything".
// Wiring: capability-checked, fail-closed client (missing function = today's behaviour) and reversal
// instead of hard delete when posting is active. Pure / in-memory only; never touches Cloud.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { Expense, ExpenseInput } from "./expenses";
import type { CategorySetting } from "./preferences";
import type { Account } from "./ledger";
import { ReceiptDetailsSchema } from "./receipt-reading";
import { buildPlan } from "./statement-pipeline/plan";
import { applyUpload, type ApplyApi, type ApplyRequest } from "./statement-pipeline/apply";
import type { StmtFile, StmtLine } from "./statement-pipeline/line";
import {
  AUTOMATION_THRESHOLDS, C11_MESSAGE, approve, approvedDecisions, assertReviewed, automationEarned, c11ReviewError, rowApprovalRequired,
  saveApprovedLabel, stampReview, unapprove,
} from "./statement-pipeline/review-gate";
import { NOT_INSTALLED, ReversalReasonRequired, isPostedEntryError, readPostingStatus, removalMode, reverseLedgerEntry, validReason } from "./posting";

const categories: CategorySetting[] = [{ name: "Food", archived: false }, { name: "Salary", archived: false }, { name: "Miscellaneous", archived: false }, { name: "Travel", archived: false }];
const bank: Account = { id: "bank", name: "HDFC savings", kind: "savings", openingBalance: 25000, archived: false };
const ln = (i: number, o: Omit<StmtLine, "key" | "file" | "currency" | "balance">): StmtLine => ({ key: `hdfc.csv#${i}`, file: "hdfc.csv", currency: "INR", balance: null, ...o });
const stmt: StmtFile = { name: "hdfc.csv", accountId: "bank", hint: null, currency: "INR", opening: 25000, closing: 109237.6, lines: [
  ln(0, { date: "2026-11-02", amount: 450, direction: "debit", description: "UPI-SWIGGY-ORDER 8812" }),
  ln(1, { date: "2026-11-03", amount: 85000, direction: "credit", description: "SALARY NOV ACME LTD" }),
  ln(2, { date: "2026-11-04", amount: 312.4, direction: "debit", description: "UPI-UBER INDIA TRIP" }),
] };

function memoryApi() {
  const saved: { id: string; input: ExpenseInput }[] = [];
  const api: ApplyApi = {
    transactions: [],
    save: async (input, opts) => {
      // the real server rule (saveExpense) applied to what the browser sends
      const err = c11ReviewError(ReceiptDetailsSchema.parse(input.receiptDetails ?? {}));
      if (err) throw new Error(err);
      saved.push({ id: opts?.createId ?? "", input });
    },
    remove: async () => {}, reconcile: async () => {}, addAccount: async () => "", setArchived: async () => {}, refresh: async () => {},
  };
  return { saved, api };
}

describe("C11 review gate (pure rules)", () => {
  it("graduated thresholds are 99.5% amounts/dates, 97% categories and >= 200 verified rows; approval stays required even when earned", () => {
    expect(AUTOMATION_THRESHOLDS).toEqual({ amountDateAccuracy: 0.995, categoryAccuracy: 0.97, minVerifiedRows: 200 });
    const ok = { issuer: "HDFC", verifiedRows: 200, amountDateAccuracy: 0.995, categoryAccuracy: 0.97 };
    expect(automationEarned(ok)).toBe(true);
    expect(automationEarned({ ...ok, verifiedRows: 199 })).toBe(false);
    expect(automationEarned({ ...ok, amountDateAccuracy: 0.9949 })).toBe(false);
    expect(automationEarned({ ...ok, categoryAccuracy: 0.9699 })).toBe(false);
    expect(automationEarned({ ...ok, categoryAccuracy: Number.NaN })).toBe(false);
    expect(automationEarned(null)).toBe(false);
    expect(rowApprovalRequired(ok)).toBe(true);
  });

  it("only individually approved rows are saved; nothing is approved by default; toggling is exact", () => {
    const ds = [{ line: { key: "a" } }, { line: { key: "b" } }, { line: { key: "c" } }];
    expect(approvedDecisions(ds, {})).toEqual([]);
    let ap = approve({}, "b", "2026-11-10T10:00:00Z");
    ap = approve(ap, "c", "2026-11-10T10:00:01Z");
    expect(approvedDecisions(ds, ap).map((d) => d.line.key)).toEqual(["b", "c"]);
    expect(approve(ap, "b", "later")).toBe(ap); // first approval time is kept
    ap = unapprove(ap, "b");
    expect(Object.keys(ap)).toEqual(["c"]);
    expect(() => assertReviewed(ds, ap)).toThrow(C11_MESSAGE);
    expect(() => assertReviewed(approvedDecisions(ds, ap), ap)).not.toThrow();
    expect(saveApprovedLabel(0)).toBe("Approve rows to save");
    expect(saveApprovedLabel(1)).toBe("Save 1 approved row");
    expect(saveApprovedLabel(12)).toBe("Save 12 approved rows");
  });

  it("stamps survive the server schema; an automatic classification without review is refused (server and DB rule)", () => {
    const stamped = stampReview({ tax: 5 }, "hdfc.csv#0", "2026-11-10T10:00:00Z");
    const parsed = ReceiptDetailsSchema.parse(stamped);
    expect(parsed.classification).toEqual({ source: "statement", automatic: true });
    expect(parsed.review).toEqual({ approvedAt: "2026-11-10T10:00:00Z", method: "row", key: "hdfc.csv#0" });
    expect(parsed.tax).toBe(5);
    expect(c11ReviewError(parsed)).toBeNull();
    const unreviewed = ReceiptDetailsSchema.parse(stampReview(undefined, "k", undefined));
    expect(c11ReviewError(unreviewed)).toBe(C11_MESSAGE);
    expect(c11ReviewError({})).toBeNull(); // manual entries are the person's own decision
    expect(() => ReceiptDetailsSchema.parse({ classification: { source: "statement", automatic: true }, review: { approvedAt: "", method: "row", key: "k" } })).toThrow();
  });
});

describe("C11 in the Statement Desk posting path", () => {
  const plan = () => buildPlan([stmt], [bank], [], categories).accounts[0]!;

  it("the old one-tap 'everything' request is refused before any write; individually approved rows batch-save, stamped", async () => {
    const p = plan();
    const suggested = [...p.auto, ...p.ask];
    expect(suggested.length).toBeGreaterThanOrEqual(2);
    // 1. Old behaviour: every suggestion in one request with no approvals -> refused, nothing saved
    const { saved, api } = memoryApi();
    const everything: ApplyRequest = { account: p, decisions: suggested, reconcileIds: [], reviewed: {} };
    await expect(applyUpload([everything], api)).rejects.toThrow(C11_MESSAGE);
    expect(saved).toEqual([]);
    // 2. Without a review map the rows are still stamped automatic, so the server refuses each save
    const legacy = memoryApi();
    await expect(applyUpload([{ account: p, decisions: suggested.slice(0, 1), reconcileIds: [] }], legacy.api)).rejects.toThrow(C11_MESSAGE);
    expect(legacy.saved).toEqual([]);
    // 3. Two rows ticked one by one: exactly those two are saved, in one batch, each with its own stamp
    const ok = memoryApi();
    let ap = {};
    for (const d of suggested.slice(0, 2)) ap = approve(ap, d.line.key, `2026-11-10T10:00:0${d.line.key.slice(-1)}Z`);
    await applyUpload([{ account: p, decisions: approvedDecisions(suggested, ap), reconcileIds: [], reviewed: ap }], ok.api);
    expect(ok.saved).toHaveLength(2);
    for (const s of ok.saved) {
      const d = ReceiptDetailsSchema.parse(s.input.receiptDetails);
      expect(d.classification?.automatic).toBe(true);
      expect(d.review?.method).toBe("row");
      expect(suggested.slice(0, 2).map((x) => x.line.key)).toContain(d.review?.key);
    }
  });

  it("the Statement Desk screen has no unchecked bulk save: no 'Apply everything', no 'Accept all', auto rows carry their own tick", () => {
    const src = readFileSync("src/routes/_authenticated/statements.tsx", "utf8");
    expect(src).not.toMatch(/Apply everything/);
    expect(src).not.toMatch(/Accept all/);
    expect(src).toMatch(/approvedDecisions\(\[\.\.\.a\.auto, \.\.\.a\.ask\], approvals\)/);
    expect(src).toMatch(/reviewed: approvals/);
    expect(src).toMatch(/aria-label=\{`Approve \$\{d\.line\.description\}`\}/g);
    expect(src.match(/aria-label=\{`Approve \$\{d\.line\.description\}`\}/g)?.length).toBe(2); // suggested + needs-decision lists
    expect(src).toMatch(/saveApprovedLabel\(approvedCount\)/);
    const server = readFileSync("src/lib/fx.functions.ts", "utf8");
    expect(server).toMatch(/c11ReviewError\(data\.receiptDetails\)/);
  });
});

describe("P7 app wiring: capability check and reversal instead of hard delete", () => {
  type R = { data: unknown; error: { message: string; code?: string } | null };
  const rpcOf = (map: Record<string, R>) => async (name: string) => map[name] ?? { data: null, error: { message: `Could not find the function public.${name}`, code: "PGRST202" } };

  it("missing posting function (production schema) keeps today's delete; an installed but inactive layer also deletes", async () => {
    expect(await readPostingStatus(rpcOf({}))).toEqual(NOT_INSTALLED);
    expect(removalMode(NOT_INSTALLED)).toBe("delete");
    const inactive = await readPostingStatus(rpcOf({ posting_status: { data: { installed: true, active: false, guest: false, canPost: true }, error: null } }));
    expect(removalMode(inactive)).toBe("delete");
    const active = await readPostingStatus(rpcOf({ posting_status: { data: { installed: true, active: true, guest: false, canPost: true }, error: null } }));
    expect(removalMode(active)).toBe("reverse");
    await expect(readPostingStatus(rpcOf({ posting_status: { data: null, error: { message: "network down", code: "08006" } } }))).rejects.toThrow(/network down/);
  });

  it("reversal needs a reason, asks for re-confirmation when the database requires it, and is idempotent by request id", async () => {
    await expect(reverseLedgerEntry({ entryId: "e1", reason: "no", requestId: "r1" }, rpcOf({}))).rejects.toBeInstanceOf(ReversalReasonRequired);
    expect(validReason("  dup  ")).toBe(false);
    expect(validReason("Duplicate of bank import")).toBe(true);
    const calls: Record<string, unknown>[] = [];
    let granted = false;
    const rpc = async (name: string, args?: Record<string, unknown>): Promise<R> => {
      calls.push({ name, ...args });
      if (!granted) return { data: null, error: { message: "STEP_UP_REQUIRED: reverse_ledger_entry", code: "42501" } };
      return { data: { entryId: "e1", request: args?.["_request"], replayed: false }, error: null };
    };
    const prompts: string[] = [];
    const out = await reverseLedgerEntry({ entryId: "e1", reason: " Duplicate of bank import ", requestId: "req-1" }, rpc, async (action) => { prompts.push(action); granted = true; return true; });
    expect(out.entryId).toBe("e1");
    expect(prompts).toEqual(["reverse_ledger_entry"]);
    expect(calls).toEqual([
      { name: "reverse_ledger_entry", _request: "req-1", _entry: "e1", _reason: "Duplicate of bank import" },
      { name: "reverse_ledger_entry", _request: "req-1", _entry: "e1", _reason: "Duplicate of bank import" },
    ]);
    // cancelled re-confirmation changes nothing
    granted = false;
    await expect(reverseLedgerEntry({ entryId: "e1", reason: "Duplicate again", requestId: "req-2" }, rpc, async () => false)).rejects.toThrow(/wasn't completed/);
  });

  it("the database refusal of a posted delete is recognised, and the store routes removal through the capability check", () => {
    expect(isPostedEntryError({ message: "P7_POSTED_ENTRY: posted entries are corrected by reversal, not deleted; use Reverse entry" })).toBe(true);
    expect(isPostedEntryError({ message: "permission denied" })).toBe(false);
    const store = readFileSync("src/lib/store.tsx", "utf8");
    const body = store.slice(store.indexOf('const remove: Ctx["remove"]'), store.indexOf('const setScope: Ctx["setScope"]'));
    expect(body.indexOf("removalMode(await postingStatus(userId))")).toBeGreaterThan(-1);
    // RB-LED-01: the store never deletes an entry; posted → reverse, unposted → withdraw (entry-removal.ts removeEntry).
    expect(body).not.toMatch(/\.from\("expenses"\)\.delete\(\)/);
    expect(body).not.toMatch(/storage\.from\("receipts"\)\.remove/);
    expect(body).toMatch(/removeEntry\(e, opts, \{ mode: .*reverse: async \(p\) => \{ await reverseLedgerEntry\(p\); \}/);
    const dialog = readFileSync("src/components/ExpenseDialog.tsx", "utf8");
    expect(dialog).toMatch(/Reverse entry/);
    expect(dialog).toMatch(/disabled=\{!validReason\(reason\)\}/);
  });

  it("expense fixtures stay typed (compile-time guard for the stamped receipt details)", () => {
    const e = { receiptDetails: stampReview<NonNullable<Expense["receiptDetails"]>>(undefined, "k", "2026-11-10T00:00:00Z") } satisfies Partial<Expense>;
    expect(e.receiptDetails.review?.key).toBe("k");
  });
});
