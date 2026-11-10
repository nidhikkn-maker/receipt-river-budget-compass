// @vitest-environment node
// TARGETED FAILURE-INJECTION tests (KK reviewer request after P0-025 / P0-026 / P9). Each test drives the REAL app code:
//   * src/lib/statement-line-claims.ts (loadImportedLines, registerStatementDrafts: exactly what StatementInbox.registerAll calls),
//     src/lib/statement-fingerprint.ts (splitNewLines), src/lib/statement-auto.ts (planStatementRegistration, draftToInput);
//   * the REAL saveExpense server handler (src/lib/fx.functions.ts) with the store's save wrapper rule
//     (statement-pipeline/save-recovery.ts saveWithRecovery + the same field mapping as store.tsx save);
//   * src/lib/pending-documents.ts (discardUsedPendingDocument) and src/lib/records-archive.ts (archive / restore);
// against an isolated in-memory PGlite (src/test/full-schema-pglite.ts: applied drizzle migrations, optionally the proposed P9
// or the whole P1..P8 + P9 stack). Never Cloud. The supabase client the app imports is replaced by a small PostgREST-shaped
// adapter over that PGlite: each request runs as the signed-in user (role authenticated, auth.uid()) in its own transaction,
// so RLS, triggers and the P9 functions decide exactly as they would for a real request. Faults are injected at that
// request boundary: "fail" = the request never reaches the database; "lose" = the database commits, then the response is lost;
// "hang" = the tab is closed while the request is in flight (nothing after it runs); "hold" = pause to force an interleaving.
// Every scenario also runs on the applied schema WITHOUT P9 (the app's pre-P9 fallback) where the app supports that mode.
import { AsyncLocalStorage } from "node:async_hooks";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { actAs, addUsers, fullSchemaDb } from "@/test/full-schema-pglite";

// ---------------------------------------------------------------------------------------------------------------------------
// PostgREST-shaped adapter over PGlite (the app's `supabase` import) with fault injection at the request boundary.
type Row = Record<string, unknown>;
type ApiError = { message: string; code?: string };
type ApiResult = { data: unknown; error: ApiError | null };
type HookKind = "fail" | "lose" | "hang" | "hold";
interface Hook {
  op: string;
  kind: HookKind;
  tab?: string | undefined;
  nth?: number | undefined;
  used?: boolean;
  reached?: () => void;
  gate?: Promise<void>;
}

const net = vi.hoisted(() => ({
  db: null as unknown,
  uid: "" as string,
  hooks: [] as unknown[],
  counts: new Map<string, number>(),
  log: [] as string[],
}));
const tabs = new AsyncLocalStorage<string>();
const tab = () => tabs.getStore() ?? "main";
const NETWORK = "TypeError: Failed to fetch";

let chain: Promise<unknown> = Promise.resolve();
/** One request at a time on the single PGlite connection (each request is its own transaction, like PostgREST). */
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const p = chain.then(fn);
  chain = p.catch(() => undefined);
  return p;
}
const dbOf = () => net.db as PGlite;

/** Run one request as the signed-in user in its own transaction. Returns rows, or the database error. */
async function request(
  sql: string,
  params: unknown[],
): Promise<{ rows: Row[]; error: ApiError | null }> {
  return exclusive(async () => {
    const db = dbOf();
    await actAs(db, net.uid || null);
    await db.exec("BEGIN");
    // Rows come back as JSON (to_jsonb), exactly the shapes PostgREST sends: dates as text, numerics as numbers.
    try {
      const r = await db.query<{ j: Row }>(sql, params);
      await db.exec("COMMIT");
      return { rows: r.rows.map((x) => x.j), error: null };
    } catch (e) {
      await db.exec("ROLLBACK");
      const x = e as Error & { code?: unknown };
      return {
        rows: [],
        error: { message: x.message, ...(typeof x.code === "string" ? { code: x.code } : {}) },
      };
    } finally {
      await actAs(db, null);
    }
  });
}

/** Apply any matching injected fault around `run`. `lost` builds what the caller sees when the network drops. */
async function intercept<T>(op: string, run: () => Promise<T>, lost: () => T): Promise<T> {
  const key = `${tab()}|${op}`;
  const n = (net.counts.get(key) ?? 0) + 1;
  net.counts.set(key, n);
  net.log.push(`${tab()}:${op}#${n}`);
  for (const h of net.hooks as Hook[]) {
    if (
      h.used ||
      h.op !== op ||
      (h.tab !== undefined && h.tab !== tab()) ||
      (h.nth !== undefined && h.nth !== n)
    )
      continue;
    h.used = true;
    if (h.kind === "fail") return lost();
    if (h.kind === "hang") return new Promise<T>(() => undefined);
    if (h.kind === "hold") {
      h.reached?.();
      await h.gate;
      return run();
    }
    const value = await run(); // "lose": the database did the work, the response never arrives
    void value;
    return lost();
  }
  return run();
}
const lostApi = (): ApiResult => ({ data: null, error: { message: NETWORK } });

const ident = (s: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`bad identifier ${s}`);
  return `"${s}"`;
};
/** A column or a PostgREST JSON path (receipt_details->reversal->>of) as SQL, every part validated. */
const colExpr = (k: string) => {
  const parts = k.split(/(->>?)/);
  if (parts.length === 1) return ident(k);
  let out = ident(parts[0]!);
  for (let i = 1; i < parts.length; i += 2) {
    if (!/^[a-z_][a-z0-9_]*$/.test(parts[i + 1]!)) throw new Error(`bad path ${k}`);
    out += `${parts[i]}'${parts[i + 1]}'`;
  }
  return out;
};
const cols = (s: string) =>
  s.trim() === "*"
    ? "*"
    : s
        .split(",")
        .map((c) => {
          // PostgREST "alias:column->key" selects (the app's narrow readers) as well as plain columns
          const m = /^(?:([a-z_][a-z0-9_]*):)?(.+)$/.exec(c.trim())!;
          const expr = colExpr(m[2]!);
          return m[1] ? `${expr} AS ${ident(m[1])}` : m[2]!.includes("->") ? `${expr} AS ${ident(m[2]!.split(/->>?/).at(-1)!)}` : expr;
        })
        .join(", ");

class Query implements PromiseLike<ApiResult> {
  private op: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  private columns = "*";
  private returning: string | null = null;
  private payload: Row[] = [];
  private conflict: string | null = null;
  private ignore = false;
  private where: { sql: (i: number) => string; value?: unknown }[] = [];
  private orderBy: string | null = null;
  private from_ = 0;
  private to_: number | null = null;
  private one: "single" | "maybe" | null = null;
  constructor(private table: string) {}
  select(c = "*") {
    if (this.op === "select") this.columns = c;
    else this.returning = c;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = "insert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  upsert(rows: Row | Row[], o: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.op = "upsert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    this.conflict = o.onConflict ?? null;
    this.ignore = !!o.ignoreDuplicates;
    return this;
  }
  update(row: Row) {
    this.op = "update";
    this.payload = [row];
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(k: string, v: unknown) {
    this.where.push({ sql: (i) => `${colExpr(k)} = $${i}`, value: v });
    return this;
  }
  neq(k: string, v: unknown) {
    this.where.push({ sql: (i) => `${ident(k)} IS DISTINCT FROM $${i}`, value: v });
    return this;
  }
  is(k: string, v: null) {
    void v;
    this.where.push({ sql: () => `${ident(k)} IS NULL` });
    return this;
  }
  in(k: string, v: unknown[]) {
    this.where.push({ sql: (i) => `${ident(k)} = ANY($${i})`, value: v });
    return this;
  }
  order(c: string) {
    this.orderBy = ident(c);
    return this;
  }
  range(a: number, b: number) {
    this.from_ = a;
    this.to_ = b;
    return this;
  }
  limit(n: number) {
    this.from_ = 0;
    this.to_ = n - 1;
    return this;
  }
  single() {
    this.one = "single";
    return this;
  }
  maybeSingle() {
    this.one = "maybe";
    return this;
  }
  private build(): { sql: string; params: unknown[] } {
    const params: unknown[] = [];
    const p = (v: unknown) => {
      params.push(
        v !== null &&
          typeof v === "object" &&
          !(Array.isArray(v) && v.every((x) => typeof x === "string"))
          ? JSON.stringify(v)
          : v,
      );
      return `$${params.length}`;
    };
    const where = () =>
      this.where.length
        ? ` WHERE ${this.where
            .map((w) => {
              if (!("value" in w)) return w.sql(0);
              params.push(w.value);
              return w.sql(params.length);
            })
            .join(" AND ")}`
        : "";
    const t = `public.${ident(this.table)}`;
    const ret = this.returning ? ` RETURNING ${cols(this.returning)}` : "";
    const json = (dml: string) => ({
      sql: `WITH r AS (${dml}${ret || " RETURNING 1 AS _"}) SELECT to_jsonb(r) AS j FROM r`,
      params,
    });
    if (this.op === "select")
      return {
        sql: `SELECT to_jsonb(x) AS j FROM (SELECT ${cols(this.columns)} FROM ${t}${where()}${this.orderBy ? ` ORDER BY ${this.orderBy}` : ""}${this.to_ !== null ? ` LIMIT ${this.to_ - this.from_ + 1} OFFSET ${this.from_}` : ""}) x`,
        params,
      };
    if (this.op === "delete") return json(`DELETE FROM ${t}${where()}`);
    if (this.op === "update") {
      const set = Object.entries(this.payload[0]!)
        .map(([k, v]) => `${ident(k)} = ${p(v)}`)
        .join(", ");
      return json(`UPDATE ${t} SET ${set}${where()}`);
    }
    const keys = [...new Set(this.payload.flatMap((r) => Object.keys(r)))];
    const values = this.payload
      .map((r) => `(${keys.map((k) => (k in r ? p(r[k]) : "DEFAULT")).join(", ")})`)
      .join(", ");
    const target = this.conflict
      ? `(${this.conflict
          .split(",")
          .map((c) => ident(c.trim()))
          .join(", ")})`
      : "";
    const on =
      this.op === "upsert"
        ? this.ignore
          ? ` ON CONFLICT ${target} DO NOTHING`
          : ` ON CONFLICT ${target} DO UPDATE SET ${keys.map((k) => `${ident(k)} = EXCLUDED.${ident(k)}`).join(", ")}`
        : "";
    return json(`INSERT INTO ${t} (${keys.map(ident).join(", ")}) VALUES ${values}${on}`);
  }
  private async exec(): Promise<ApiResult> {
    const { sql, params } = this.build();
    return intercept(
      `${this.op}:${this.table}`,
      async () => {
        const r = await request(sql, params);
        if (r.error) return { data: null, error: r.error };
        const rows = this.op === "select" || this.returning ? r.rows : null;
        if (this.one && rows) {
          if (this.one === "single" && rows.length !== 1)
            return {
              data: null,
              error: {
                code: "PGRST116",
                message: "JSON object requested, multiple (or no) rows returned",
              },
            };
          return { data: rows[0] ?? null, error: null };
        }
        return { data: rows, error: null };
      },
      lostApi,
    );
  }
  then<A = ApiResult, B = never>(
    ok?: ((v: ApiResult) => A | PromiseLike<A>) | null,
    bad?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.exec().then(ok, bad);
  }
}

async function rpc(name: string, args: Row = {}): Promise<ApiResult> {
  return intercept(
    `rpc:${name}`,
    async () => {
      const fn = await exclusive(async () => {
        await actAs(dbOf(), null);
        return (
          await dbOf().query<{ set: boolean }>(
            "SELECT proretset AS set FROM pg_proc WHERE proname = $1 AND pronamespace = 'public'::regnamespace",
            [name],
          )
        ).rows[0];
      });
      if (!fn)
        return {
          data: null,
          error: {
            code: "PGRST202",
            message: `Could not find the function public.${name} in the schema cache`,
          },
        };
      const params: unknown[] = [];
      const list = Object.entries(args)
        .map(([k, v]) => {
          params.push(
            v !== null &&
              typeof v === "object" &&
              !(Array.isArray(v) && v.every((x) => typeof x === "string"))
              ? JSON.stringify(v)
              : v,
          );
          return `${ident(k)} => $${params.length}`;
        })
        .join(", ");
      const r = await request(
        fn.set
          ? `SELECT to_jsonb(x) AS j FROM public.${ident(name)}(${list}) x`
          : `SELECT to_jsonb(public.${ident(name)}(${list})) AS j`,
        params,
      );
      if (r.error) return { data: null, error: r.error };
      return { data: fn.set ? r.rows : (r.rows[0] ?? null), error: null };
    },
    lostApi,
  );
}

const storage = {
  from: (bucket: string) => ({
    upload: (path: string, file: Blob) =>
      intercept(
        `upload:${bucket}`,
        async () => {
          const r = await request(
            "WITH r AS (INSERT INTO storage.objects(bucket_id, name, owner_id, metadata) VALUES ($1, $2, auth.uid()::text, $3) RETURNING name) SELECT to_jsonb(r) AS j FROM r",
            [bucket, path, JSON.stringify({ size: file.size, mimetype: file.type })],
          );
          return { data: r.error ? null : { path }, error: r.error };
        },
        lostApi,
      ),
    remove: (paths: string[]) =>
      intercept(
        `remove:${bucket}`,
        async () => {
          const r = await request(
            "WITH r AS (DELETE FROM storage.objects WHERE bucket_id = $1 AND name = ANY($2) RETURNING name) SELECT to_jsonb(r) AS j FROM r",
            [bucket, paths],
          );
          return { data: r.rows, error: r.error };
        },
        lostApi,
      ),
  }),
};

const client = () => ({
  from: (t: string) => new Query(t),
  rpc: (n: string, a?: Row) => rpc(n, a),
  storage: { from: (b: string) => storage.from(b) },
});
// Lazy: vi.mock factories are hoisted above the declarations they use.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) => client().from(t),
    rpc: (n: string, a?: Row) => client().rpc(n, a),
    storage: { from: (b: string) => client().storage.from(b) },
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
// createServerFn: run the REAL handler in-process with the signed-in user's client. The server call itself is one network hop.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: (d: unknown) => unknown = (d) => d;
    const b = {
      middleware: () => b,
      inputValidator: (v: (d: unknown) => unknown) => {
        validate = v;
        return b;
      },
      handler:
        (
          fn: (x: {
            data: unknown;
            context: { supabase: unknown; userId: string };
          }) => Promise<unknown>,
        ) =>
        (x: { data: unknown }) =>
          intercept(
            "server:saveExpense",
            () => fn({ data: validate(x.data), context: { supabase: client(), userId: net.uid } }),
            () => {
              throw new TypeError("Failed to fetch");
            },
          ),
    };
    return b;
  },
}));

import {
  loadImportedLines,
  registerStatementDrafts,
  stableLineEntryId,
  type RegisterResult,
} from "./statement-line-claims";
import { splitNewLines, filePattern } from "./statement-fingerprint";
import { planStatementRegistration } from "./statement-auto";
import { defaultPreferences, type FinancePreferences } from "./preferences";
import { saveExpense } from "./fx.functions";
import { saveWithRecovery } from "./statement-pipeline/save-recovery";
import { validateExpense, type ExpenseInput, type StatementLine } from "./expenses";
import { discardUsedPendingDocument, PENDING_RECEIPT } from "./pending-documents";
import { archiveTableRecord, restoreTableRecord } from "./records-archive";
import { supabase } from "@/integrations/supabase/client";
import { setEntryWithdrawal } from "./withdrawal.functions";
import { removeEntry } from "./entry-removal";
import { ReversalReasonRequired } from "./posting";
import { accountBalance, cashflow, ledgerView, LEDGER_COLUMNS, netWorth, txnFromRow, type Account, type LedgerRow, type Txn } from "./ledger";
import { loadOwnerReportData } from "./report-jobs.server";
import { readAssistantFacts } from "./assistant-facts.server";
import { atomicStatementUndo } from "./statement-pipeline/atomic-undo";
import { guardedRestore, previousRestoreLine, type RestoreDb } from "./restore-guard";
import { decideEntryChange, listEntryChanges, requestEntryChange } from "./entry-requests";
import { decideAssetDisposal, requestAssetDisposal } from "./asset-disposal.functions";
import { authoriseExport, exportBackupData } from "./exports.functions";
import { sha256Hex, type ExportKind, type ExportRequest } from "./exports";
import { BACKUP_TABLES, planRestore, type Backup, type BackupRow } from "./backup";
import type { Json } from "@/integrations/supabase/types";
import { applyUpload, PartialUploadError, undoUpload, type ApplyApi, type ApplyResult } from "./statement-pipeline/apply";
import { buildPlan } from "./statement-pipeline/plan";
import { fromStatementLines, type StmtFile } from "./statement-pipeline/line";
import { undoStatement, statementUndoCapability } from "./statement-pipeline/atomic-undo.functions";
import { UNDO_NEEDS_UPDATE } from "./statement-pipeline/undo-capability";
import type { Expense } from "./expenses";

// ---------------------------------------------------------------------------------------------------------------------------
// App flows, wired exactly as the app wires them.

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const O = id(1),
  V = id(2);
const P9 = ".lovable/staged-sql/proposed/P9_statement_import_idempotency_and_archive_guards.sql";
const STACK = [
  "P1_security_containment",
  "P2_v31_role_model",
  "P4_step_up_and_assistant_limits",
  "P5_legal_entities_foundation",
  "P5b_restore_investments",
  "P6_registers",
  "P7_balanced_posting",
  "P8_asset_depreciation_posting",
].map((f) => `.lovable/staged-sql/proposed/${f}.sql`);
const T = 600_000;

const safeName = (n: string) => n.replace(/[^\w.-]/g, "_").slice(-120); // as store.tsx
/** store.tsx `save` (online path): validate, upload files, then saveExpense through saveWithRecovery with the owner read-back. */
async function storeSave(
  s: ExpenseInput,
  opts: { createId?: string; files?: File[] } = {},
): Promise<void> {
  validateExpense(s);
  let receipts: { name: string; type: string; path: string }[] | undefined;
  if (opts.files?.length) {
    receipts = [];
    for (const f of opts.files) {
      const path = `${net.uid}/${crypto.randomUUID()}-${safeName(f.name)}`;
      const { error } = await supabase.storage
        .from("receipts")
        .upload(path, f, { contentType: f.type });
      if (error) throw new Error(`Couldn't upload ${f.name}`);
      receipts.push({ name: f.name, type: f.type, path });
    }
  }
  await saveWithRecovery(
    async () => {
      const res = await saveExpense({
        data: {
          id: null,
          ...(opts.createId ? { createId: opts.createId } : {}),
          title: s.title.trim(),
          merchant: s.merchant,
          category: s.category,
          scope: s.scope,
          memberId: s.memberId,
          splits: s.splits ?? [],
          currency: s.currency,
          originalAmount: s.amount,
          date: s.date,
          description: s.description,
          paymentMethod: s.paymentMethod,
          txnType: s.txnType ?? "expense",
          accountId: s.accountId ?? null,
          toAccountId: s.toAccountId ?? null,
          paymentInstrumentId: s.paymentInstrumentId ?? null,
          payeeId: s.payeeId ?? null,
          tags: s.tags ?? [],
          workspaceAllocations: s.workspaceAllocations ?? [],
          tripId: s.tripId ?? null,
          principal: s.principal ?? null,
          interest: s.interest ?? null,
          receiptDetails: s.receiptDetails,
          reimbursementStatus: s.reimbursementStatus ?? "none",
          adjustmentSign: s.adjustmentSign ?? 1,
          ...(receipts ? { receipts } : {}),
        },
      });
      if (!res.ok) throw new Error(res.error);
    },
    async () => {
      if (!opts.createId || receipts?.length) return null;
      const result = await supabase
        .from("expenses")
        .select("*")
        .eq("id", opts.createId)
        .eq("employee_id", net.uid)
        .maybeSingle();
      if (result.error) return null;
      return result.data as Record<string, unknown> | null;
    },
    s,
  );
}
/** store.tsx `reconcile`. */
async function storeReconcile(entryId: string, ref: string) {
  const r = await supabase
    .from("expenses")
    .update({ statement_ref: ref, reconciled_at: new Date().toISOString() })
    .eq("id", entryId);
  if (r.error) throw new Error(r.error.message);
}

const PREFS: FinancePreferences = defaultPreferences();
/**
 * StatementInbox, one upload + Register tap: loadKnown → splitNewLines → planStatementRegistration → registerAll
 * (registerStatementDrafts with store.save(createId) + reconcile, then markSeen of every line except failed ones).
 * The plan is built with NO ledger transactions on screen (the worst case: the store had not refreshed), so only the
 * claim/stable-id rules stand between a repeat and a duplicate.
 */
async function importStatement(
  account: string,
  fileName: string,
  lines: StatementLine[],
): Promise<RegisterResult & { fresh: number }> {
  const loaded = await loadImportedLines(account); // throws on any failed read: Register stays blocked
  const split = splitNewLines(lines, account, loaded.known, loaded.upTo);
  const plan = planStatementRegistration(split.fresh, [], {
    transactions: [],
    accounts: [
      { id: account, name: "HDFC Savings", kind: "savings", openingBalance: 0, archived: false },
    ],
    categories: PREFS.categories,
    accountId: account,
    currency: "INR",
  });
  const queue = plan.register;
  expect(plan.review.length + plan.possibleDuplicates.length + plan.skipped.length).toBe(0); // every fixture line auto-registers
  const r = await registerStatementDrafts(
    {
      owner: net.uid,
      accountKey: account,
      fileName,
      drafts: queue,
      fingerprints: split.fingerprints,
      known: loaded.known,
    },
    {
      save: (input, entryId) =>
        storeSave(input, { createId: entryId }).catch((e: Error) => {
          net.log.push(`save-error:${e.message}`);
          throw e;
        }),
      reconcile: (entryId, ref) =>
        storeReconcile(entryId, ref).catch((e: Error) => {
          net.log.push(`reconcile-error:${e.message}`);
          throw e;
        }),
    },
  );
  // markSeen(skip failed)
  const skip = new Set(r.failed.map((f) => f.ref));
  const batch = crypto.randomUUID();
  const label = filePattern(fileName);
  const rows = lines
    .filter((l) => !skip.has(l.ref))
    .map((l) => ({
      account_key: account,
      fingerprint: split.fingerprints.get(l.ref)!,
      line_date: l.date,
      batch_id: batch,
      file_label: label,
    }));
  if (rows.length)
    await supabase
      .from("statement_line_imports")
      .upsert(rows, { onConflict: "owner_id,account_key,fingerprint", ignoreDuplicates: true });
  return { ...r, fresh: split.fresh.length };
}

// November HDFC statement. Hand-calculated total of the five debits: 450.00 + 1,234.50 + 2,999.00 + 2,999.00 + 649.00 = 8,331.50.
// L3 and L4 are identical same-day lines (no bank reference): they are told apart as #0 / #1 and are TWO real purchases.
const NOV: StatementLine[] = [
  {
    ref: "1",
    date: "2026-11-01",
    description: "UPI/SWIGGY/412345678901",
    amount: 450,
    direction: "debit",
  },
  {
    ref: "2",
    date: "2026-11-02",
    description: "UPI/BIGBASKET/412345678902",
    amount: 1234.5,
    direction: "debit",
  },
  {
    ref: "3",
    date: "2026-11-03",
    description: "POS AMAZON RETAIL",
    amount: 2999,
    direction: "debit",
  },
  {
    ref: "4",
    date: "2026-11-03",
    description: "POS AMAZON RETAIL",
    amount: 2999,
    direction: "debit",
  },
  {
    ref: "5",
    date: "2026-11-05",
    description: "NETFLIX SUBSCRIPTION 412345678905",
    amount: 649,
    direction: "debit",
  },
];
const NOV_TOTAL = 8331.5;
// A later re-download covering 3–7 Nov: L3, L4, L5 again (overlap) plus one new line, 380.00. New total 8,331.50 + 380.00 = 8,711.50.
const NOV_REDOWNLOAD: StatementLine[] = [
  {
    ref: "a",
    date: "2026-11-03",
    description: "POS AMAZON RETAIL",
    amount: 2999,
    direction: "debit",
  },
  {
    ref: "b",
    date: "2026-11-03",
    description: "POS AMAZON RETAIL",
    amount: 2999,
    direction: "debit",
  },
  {
    ref: "c",
    date: "2026-11-05",
    description: "NETFLIX SUBSCRIPTION 412345678905",
    amount: 649,
    direction: "debit",
  },
  {
    ref: "d",
    date: "2026-11-07",
    description: "UPI/ZOMATO/412345678907",
    amount: 380,
    direction: "debit",
  },
];

type Db = PGlite;
const sql1 = async <R = Row>(db: Db, q: string, p: unknown[] = []) => {
  await exclusive(() => actAs(db, null));
  return (await exclusive(() => db.query<R>(q, p))).rows;
};
/** Ledger rows the statement produced for this account (as the operator sees them, outside RLS). */
const ledger = async (db: Db, account: string) => {
  const rows = await sql1<{ id: string; amount: string; expense_date: string }>(
    db,
    "SELECT id, amount::text, expense_date::text FROM public.expenses WHERE account_id = $1 AND description = 'Statement import' ORDER BY expense_date, id",
    [account],
  );
  return {
    n: rows.length,
    total: Math.round(rows.reduce((s, r) => s + Number(r.amount) * 100, 0)) / 100,
    ids: rows.map((r) => r.id),
  };
};
const linesFor = async (db: Db, account: string) =>
  (
    await sql1<{ n: number }>(
      db,
      "SELECT count(*)::int n FROM public.statement_line_imports WHERE account_key = $1",
      [account],
    )
  )[0]!.n;
const stableIds = async (owner: string, account: string, lines: StatementLine[]) => {
  const fps = splitNewLines(lines, account, new Set(), null).fingerprints;
  return Promise.all(lines.map((l) => stableLineEntryId(owner, fps.get(l.ref)!)));
};
let accSeq = 100;
async function freshAccount(db: Db, owner = O): Promise<string> {
  const acc = id(++accSeq);
  await sql1(
    db,
    "INSERT INTO public.accounts(id, owner_id, name, kind) VALUES ($1, $2, 'HDFC Savings', 'savings')",
    [acc, owner],
  );
  return acc;
}
function reset(db: Db, uid = O) {
  net.db = db;
  net.uid = uid;
  net.hooks = [];
  net.counts.clear();
  net.log = [];
}
function hook(h: Hook) {
  (net.hooks as Hook[]).push(h);
  return h;
}
function hold(op: string, t: string) {
  let release!: () => void;
  let reached!: () => void;
  const atGate = new Promise<void>((r) => {
    reached = r;
  });
  const h = hook({
    op,
    kind: "hold",
    tab: t,
    reached,
    gate: new Promise<void>((r) => {
      release = r;
    }),
  });
  void h;
  return { atGate, release: () => release() };
}
async function seedUsers(db: Db) {
  await addUsers(db, { [O]: "o@x.in", [V]: "v@x.in" });
  await sql1(
    db,
    "INSERT INTO public.finance_preferences(owner_id, data) VALUES ($1, '{}'), ($2, '{}') ON CONFLICT (owner_id) DO NOTHING",
    [O, V],
  );
}

/** Raw SQL as uid in a transaction that is always rolled back (used to record what a request WOULD do without keeping it). */
async function probe(
  db: Db,
  uid: string | null,
  q: string | [string, unknown[]][],
  p: unknown[] = [],
): Promise<string> {
  return exclusive(async () => {
    await actAs(db, uid);
    await db.exec("BEGIN");
    try {
      let n = 0;
      for (const [x, xp] of typeof q === "string" ? [[q, p] as [string, unknown[]]] : q) {
        const r = await db.query(x, xp);
        n = r.affectedRows ?? r.rows.length;
      }
      return `ok:${n}`;
    } catch (e) {
      return (e as Error).message;
    } finally {
      await db.exec("ROLLBACK");
      await actAs(db, null);
    }
  });
}
const TABLES = ["loans", "goals", "commitments", "asset_valuations", "documents"] as const;
async function seedArchiveRows(db: Db, owner: string, acc: string) {
  const ids = {
    loans: crypto.randomUUID(),
    goals: crypto.randomUUID(),
    commitments: crypto.randomUUID(),
    asset_valuations: crypto.randomUUID(),
    documents: crypto.randomUUID(),
  };
  await sql1(
    db,
    "INSERT INTO public.loans(id, owner_id, name, principal_outstanding, annual_rate, emi, next_due) VALUES ($1,$2,'Home loan',100000,9,2000,'2026-12-05')",
    [ids.loans, owner],
  );
  await sql1(
    db,
    "INSERT INTO public.goals(id, owner_id, name, target) VALUES ($1,$2,'Emergency fund',50000)",
    [ids.goals, owner],
  );
  await sql1(
    db,
    "INSERT INTO public.commitments(id, owner_id, name, amount, next_due, status) VALUES ($1,$2,'Rent',15000,'2026-12-01','cancelled')",
    [ids.commitments, owner],
  );
  await sql1(
    db,
    "INSERT INTO public.asset_valuations(id, owner_id, account_id, value, valued_on) VALUES ($1,$2,$3,250000,'2026-10-31')",
    [ids.asset_valuations, owner, acc],
  );
  await sql1(
    db,
    "INSERT INTO public.documents(id, owner_id, title, file_path, file_name, size_bytes, notes) VALUES ($1,$2,'LIC policy',$3,'lic.pdf',1000,'')",
    [ids.documents, owner, `${owner}/docs/${ids.documents}-lic.pdf`],
  );
  return ids;
}
const present = async (db: Db, t: string, rowId: string) =>
  (
    await sql1<{ n: number }>(db, `SELECT count(*)::int n FROM public.${t} WHERE id = $1`, [rowId])
  )[0]!.n;
const prefsOf = async (owner: string): Promise<FinancePreferences> => {
  const r = await supabase
    .from("finance_preferences")
    .select("data")
    .eq("owner_id", owner)
    .maybeSingle();
  if (r.error) throw new Error(r.error.message);
  return ((r.data as { data?: FinancePreferences } | null)?.data ?? {}) as FinancePreferences;
};
// The raw adapter (same requests as `supabase`, without the generated types): proposed P9 columns and arbitrary JSON bodies,
// i.e. what a hand-written API call can send.
const api = () => client();
const writePrefs = (owner: string, data: unknown) =>
  api().from("finance_preferences").update({ data }).eq("owner_id", owner).select("owner_id");
const storedArchive = async (db: Db, owner: string) =>
  (
    await sql1<{ r: unknown }>(
      db,
      "SELECT data->'recordArchive' r FROM public.finance_preferences WHERE owner_id = $1",
      [owner],
    )
  )[0]?.r;

// ---------------------------------------------------------------------------------------------------------------------------
const MODES = [
  { name: "with P9", extra: [P9], p9: true },
  { name: "WITHOUT P9 (pre-P9 app fallback)", extra: [] as string[], p9: false },
] as const;

for (const mode of MODES) {
  describe(`statement import failure injection — ${mode.name}`, () => {
    let db: Db;
    beforeAll(async () => {
      db = await fullSchemaDb([...mode.extra]);
      await seedUsers(db);
    }, T);

    it(
      "1. repeat upload of the same file (twice) and a later overlapping re-download → one ledger row per statement line",
      async () => {
        // Injected: none (pure repetition). Expected (hand-calculated): 5 rows, 8,331.50 after the first upload; the identical
        // second upload adds 0 rows and leaves 8,331.50; the overlapping re-download adds only the 7 Nov line: 6 rows, 8,711.50.
        reset(db);
        const acc = await freshAccount(db);
        const first = await importStatement(acc, "HDFC_Statement_05112026.csv", NOV);
        expect(first.registered).toHaveLength(5);
        expect(await ledger(db, acc)).toMatchObject({ n: 5, total: NOV_TOTAL });
        expect((await ledger(db, acc)).ids.sort()).toEqual((await stableIds(O, acc, NOV)).sort());
        const second = await importStatement(acc, "HDFC_Statement_05112026.csv", NOV);
        expect(second.fresh).toBe(0);
        expect(second.registered).toHaveLength(0);
        expect(await ledger(db, acc)).toMatchObject({ n: 5, total: NOV_TOTAL });
        const third = await importStatement(acc, "HDFC_Statement_07112026.csv", NOV_REDOWNLOAD);
        expect(third.fresh).toBe(1);
        expect(third.registered).toEqual(["d"]);
        expect(await ledger(db, acc)).toMatchObject({ n: 6, total: 8711.5 });
        expect(await linesFor(db, acc)).toBe(6);
        // P9: every line row records the entry it registered as (database-backed claim); pre-P9: plain "seen" rows.
        const withEntry = (
          await sql1<{ n: number }>(
            db,
            "SELECT count(*)::int n FROM public.statement_line_imports s WHERE account_key = $1 AND to_jsonb(s)->>'entry_id' IS NOT NULL AND to_jsonb(s)->>'registered_at' IS NOT NULL",
            [acc],
          )
        )[0]!.n;
        expect(withEntry).toBe(mode.p9 ? 6 : 0);
      },
      T,
    );

    it(
      "2a. import interrupted by a failed 3rd entry save → saved rows stay, the failed line is retried with the SAME id and lands once",
      async () => {
        // Injected: the 3rd saveExpense request fails before reaching the database (L3, 2,999.00).
        // Expected: after the first tap 4 rows, 8,331.50 − 2,999.00 = 5,332.50, L3 reported failed and not remembered as seen;
        // the retry tap offers only L3, saves it with its stable id: 5 rows, 8,331.50, ids = the 5 stable line ids.
        reset(db);
        const acc = await freshAccount(db);
        hook({ op: "server:saveExpense", kind: "fail", nth: 3 });
        const r = await importStatement(acc, "HDFC_Statement_05112026.csv", NOV);
        expect(r.registered).toEqual(["1", "2", "4", "5"]);
        expect(r.failed.map((f) => f.ref)).toEqual(["3"]);
        expect(await ledger(db, acc)).toMatchObject({ n: 4, total: 5332.5 });
        const retry = await importStatement(acc, "HDFC_Statement_05112026.csv", NOV);
        expect(retry.fresh).toBe(1);
        expect(retry.registered).toEqual(["3"]);
        expect(retry.failed).toEqual([]);
        const l = await ledger(db, acc);
        expect(l).toMatchObject({ n: 5, total: NOV_TOTAL });
        expect(l.ids.sort()).toEqual((await stableIds(O, acc, NOV)).sort());
      },
      T,
    );

    it(
      "2b. tab closed mid-batch (3rd save never returns; confirm and markSeen never run) → a new tab re-registers with the same ids, no duplicates",
      async () => {
        // Injected: tab1's 3rd saveExpense hangs forever (tab closed mid-batch). L1, L2 are saved; nothing after runs.
        // Expected: 2 rows (450.00 + 1,234.50 = 1,684.50) while tab1 is gone; tab2 uploads the same file: lines 1–2 save onto
        // their existing ids (no new row), 3–5 are added: 5 rows, 8,331.50; every id is the stable id of its line.
        reset(db);
        const acc = await freshAccount(db);
        hook({ op: "server:saveExpense", kind: "hang", tab: "tab1", nth: 3 });
        void tabs.run("tab1", () => importStatement(acc, "HDFC_Statement_05112026.csv", NOV));
        await vi.waitFor(() => expect(net.log).toContain("tab1:server:saveExpense#3"));
        expect(await ledger(db, acc)).toMatchObject({ n: 2, total: 1684.5 });
        const r = await tabs.run("tab2", () =>
          importStatement(acc, "HDFC_Statement_05112026.csv", NOV),
        );
        expect(r.fresh).toBe(5);
        expect(r.failed).toEqual([]);
        const l = await ledger(db, acc);
        expect(l).toMatchObject({ n: 5, total: NOV_TOTAL });
        expect(l.ids.sort()).toEqual((await stableIds(O, acc, NOV)).sort());
        if (mode.p9)
          expect(
            (
              await sql1<{ n: number }>(
                db,
                "SELECT count(*)::int n FROM public.statement_line_imports WHERE account_key=$1 AND registered_at IS NOT NULL",
                [acc],
              )
            )[0]!.n,
          ).toBe(5);
      },
      T,
    );

    it(
      "3a. network failure before the request reaches the database (imported-lines read, claim, pending read) → nothing saved; the retry saves each line once",
      async () => {
        // Injected, one per tap: (1) the imported-lines read fails; (2) the claim request fails; (3) the pending-lines read fails.
        // Expected: each failed tap throws and saves 0 rows (never a partial set, never an unchecked save); the 4th tap saves 5
        // rows, 8,331.50.
        reset(db);
        const acc = await freshAccount(db);
        hook({ op: "select:statement_line_imports", kind: "fail", nth: 1 });
        await expect(importStatement(acc, "HDFC_Statement_05112026.csv", NOV)).rejects.toThrow(
          "Couldn't check earlier uploads",
        );
        hook({ op: "rpc:claim_statement_lines", kind: "fail", nth: 1 });
        await expect(importStatement(acc, "HDFC_Statement_05112026.csv", NOV)).rejects.toThrow(
          /Couldn't check which statement lines are new — nothing more was registered/,
        );
        expect(await ledger(db, acc)).toMatchObject({ n: 0, total: 0 });
        hook({ op: "rpc:pending_statement_lines", kind: "fail", nth: 2 }); // 1st call was in tap 2
        await expect(importStatement(acc, "HDFC_Statement_05112026.csv", NOV)).rejects.toThrow(
          "Couldn't check earlier uploads",
        );
        expect(await ledger(db, acc)).toMatchObject({ n: 0, total: 0 });
        const r = await importStatement(acc, "HDFC_Statement_05112026.csv", NOV);
        expect(r.registered).toHaveLength(5);
        expect(await ledger(db, acc)).toMatchObject({ n: 5, total: NOV_TOTAL });
      },
      T,
    );

    it(
      "3b. the database commits but the response is lost (entry save, save + read-back, claim, confirm) → no retry creates a second row",
      async () => {
        // Injected: (1) L2's saveExpense commits, response lost → the owner read-back proves it (saveWithRecovery): 5 rows, 0 failed.
        // Expected 5 rows, 8,331.50 on account A.
        reset(db);
        const a = await freshAccount(db);
        hook({ op: "server:saveExpense", kind: "lose", nth: 2 });
        const r1 = await importStatement(a, "HDFC_Statement_05112026.csv", NOV);
        expect(r1.registered).toHaveLength(5);
        expect(r1.failed).toEqual([]);
        expect(await ledger(db, a)).toMatchObject({ n: 5, total: NOV_TOTAL });

        // (2) L2's save commits, response lost AND the read-back fails → L2 reported failed (kept for retry, not marked seen).
        // Expected: 5 rows already (L2 is in the ledger); the retry re-saves L2 onto its id: still 5 rows, 8,331.50.
        reset(db);
        const b = await freshAccount(db);
        hook({ op: "server:saveExpense", kind: "lose", nth: 2 });
        // select:expenses #1 is registerStatementDrafts' read of references the entries already hold (RB-STM-01); #2 is L2's read-back.
        hook({ op: "select:expenses", kind: "fail", nth: 2 });
        const r2 = await importStatement(b, "HDFC_Statement_05112026.csv", NOV);
        expect(r2.failed.map((f) => f.ref)).toEqual(["2"]);
        expect(await ledger(db, b)).toMatchObject({ n: 5, total: NOV_TOTAL });
        const r2b = await importStatement(b, "HDFC_Statement_05112026.csv", NOV);
        expect(r2b.fresh).toBe(1);
        expect(r2b.failed).toEqual([]);
        expect(await ledger(db, b)).toMatchObject({ n: 5, total: NOV_TOTAL });

        // (3) The claim commits, its response is lost → the tap throws before any save; the retry saves 5 rows, 8,331.50.
        reset(db);
        const c = await freshAccount(db);
        hook({ op: "rpc:claim_statement_lines", kind: "lose", nth: 1 });
        await expect(importStatement(c, "HDFC_Statement_05112026.csv", NOV)).rejects.toThrow(
          /nothing more was registered/,
        );
        expect(await ledger(db, c)).toMatchObject({ n: 0, total: 0 });
        expect(await linesFor(db, c)).toBe(mode.p9 ? 5 : 0); // P9: the claims exist (pending), so the retry reuses them
        const r3 = await importStatement(c, "HDFC_Statement_05112026.csv", NOV);
        expect(r3.registered).toHaveLength(5);
        expect(await ledger(db, c)).toMatchObject({ n: 5, total: NOV_TOTAL });

        // (4) P9 only: the confirm commits... or is lost entirely → the lines stay pending and are offered again; registering
        // them again adds nothing. Expected: 5 rows, 8,331.50 after both taps; every line confirmed after the second.
        reset(db);
        const d = await freshAccount(db);
        hook({ op: "rpc:confirm_statement_lines", kind: "fail", nth: 1 });
        await importStatement(d, "HDFC_Statement_05112026.csv", NOV);
        expect(await ledger(db, d)).toMatchObject({ n: 5, total: NOV_TOTAL });
        const r4 = await importStatement(d, "HDFC_Statement_05112026.csv", NOV);
        expect(r4.fresh).toBe(mode.p9 ? 5 : 0); // P9 offers unconfirmed lines again; pre-P9 markSeen already remembered them
        expect(await ledger(db, d)).toMatchObject({ n: 5, total: NOV_TOTAL });
        if (mode.p9)
          expect(
            (
              await sql1<{ n: number }>(
                db,
                "SELECT count(*)::int n FROM public.statement_line_imports WHERE account_key=$1 AND registered_at IS NULL",
                [d],
              )
            )[0]!.n,
          ).toBe(0);
      },
      T,
    );

    const confirmOp = mode.p9 ? "rpc:confirm_statement_lines" : "upsert:statement_line_imports";
    const interleave = async (order: "A-then-B saves" | "B-saves-first") => {
      const acc = await freshAccount(db);
      const g = {
        aClaim: hold("rpc:claim_statement_lines", "A"),
        bClaim: hold("rpc:claim_statement_lines", "B"),
        aSave: hold("server:saveExpense", "A"),
        bSave: hold("server:saveExpense", "B"),
        aConf: hold(confirmOp, "A"),
        bConf: hold(confirmOp, "B"),
      };
      const pa = tabs.run("A", () => importStatement(acc, "HDFC_Statement_05112026.csv", NOV));
      const pb = tabs.run("B", () => importStatement(acc, "HDFC_Statement_05112026.csv", NOV));
      await g.aClaim.atGate;
      await g.bClaim.atGate; // both tabs read "nothing imported yet"
      g.aClaim.release();
      await g.aSave.atGate; // claim A
      g.bClaim.release();
      await g.bSave.atGate; // claim B
      if (order === "A-then-B saves") {
        g.aSave.release();
        await g.aConf.atGate;
        g.bSave.release();
        await g.bConf.atGate;
      } else {
        g.bSave.release();
        await g.bConf.atGate;
        g.aSave.release();
        await g.aConf.atGate;
      }
      g.aConf.release();
      g.bConf.release();
      return { acc, results: await Promise.all([pa, pb]) };
    };

    it(
      "4. concurrent imports of the same document (claim A, claim B, then saves in either order, confirm both; and fully concurrent) → one row per line, no error",
      async () => {
        // Injected: two tabs register the same statement, both having read the imported-lines set before either claimed.
        // Expected for every interleaving: 5 rows, 8,331.50 per account, 0 failed lines and no thrown error in either tab.
        for (const order of ["A-then-B saves", "B-saves-first"] as const) {
          reset(db);
          const { acc, results } = await interleave(order);
          for (const r of results) expect(r.failed).toEqual([]);
          expect(await ledger(db, acc)).toMatchObject({ n: 5, total: NOV_TOTAL });
          expect(await linesFor(db, acc)).toBe(5);
        }
        // A finishes completely before B (which read the set earlier) claims: with P9 B registers nothing; pre-P9 B re-saves onto the same ids.
        reset(db);
        const acc = await freshAccount(db);
        const bClaim = hold("rpc:claim_statement_lines", "B");
        const pb = tabs.run("B", () => importStatement(acc, "HDFC_Statement_05112026.csv", NOV));
        await bClaim.atGate;
        const ra = await tabs.run("A", () =>
          importStatement(acc, "HDFC_Statement_05112026.csv", NOV),
        );
        bClaim.release();
        const rb = await pb;
        expect(ra.registered).toHaveLength(5);
        expect(rb.failed).toEqual([]);
        expect(rb.registered).toHaveLength(mode.p9 ? 0 : 5);
        expect(rb.alreadyImported).toHaveLength(mode.p9 ? 5 : 0);
        expect(await ledger(db, acc)).toMatchObject({ n: 5, total: NOV_TOTAL });
        // Fully concurrent, no forced order.
        reset(db);
        const acc2 = await freshAccount(db);
        const both = await Promise.all([
          tabs.run("A", () => importStatement(acc2, "x.csv", NOV)),
          tabs.run("B", () => importStatement(acc2, "x.csv", NOV)),
        ]);
        for (const r of both) expect(r.failed).toEqual([]);
        expect(await ledger(db, acc2)).toMatchObject({ n: 5, total: NOV_TOTAL });
      },
      T,
    );

    it(
      "5. deletion through the API (PostgREST DELETE, TRUNCATE) instead of the interface: archive-controlled rows and line registrations",
      async () => {
        // Injected: the signed-in owner bypasses Archive and sends DELETE /rest/v1/<table>?id=eq.<id> (and ?owner_id=eq.<me>),
        // plus a raw TRUNCATE; another user tries the same on the owner's rows. Expected with P9: every owner DELETE/TRUNCATE is
        // refused with P9_ARCHIVE_ONLY and all 5 rows stay (5 of 5); the other user deletes 0 rows and reads 0 rows; the service path
        // and confirmed erasure (the other user's own delete_my_finance_data) still delete. Without P9: the owner's DELETE succeeds
        // (archive is an app/interface rule only) — recorded in a rolled-back probe so the row is not lost.
        reset(db);
        const acc = await freshAccount(db);
        const vAcc = await freshAccount(db, V);
        const mine = await seedArchiveRows(db, O, acc);
        const theirs = await seedArchiveRows(db, V, vAcc);
        for (const t of TABLES) {
          if (mode.p9) {
            const one = await supabase.from(t).delete().eq("id", mine[t]).select("id");
            expect(one.error?.message).toMatch(
              new RegExp(`P9_ARCHIVE_ONLY: ${t} records are archived, not deleted`),
            );
            const all = await supabase.from(t).delete().eq("owner_id", O).select("id");
            expect(all.error?.message).toMatch(/P9_ARCHIVE_ONLY/);
            expect(await probe(db, O, `TRUNCATE public.${t} CASCADE`)).toMatch(
              /P9_ARCHIVE_ONLY|permission denied/,
            );
          } else {
            expect(await probe(db, O, `DELETE FROM public.${t} WHERE id = $1`, [mine[t]])).toBe(
              "ok:1",
            ); // pre-P9: allowed (app-only archive)
          }
          expect(await present(db, t, mine[t])).toBe(1);
          // another signed-in user: RLS hides the row, so the delete matches nothing and the read returns nothing
          net.uid = V;
          const vd = await supabase.from(t).delete().eq("id", mine[t]).select("id");
          expect(vd.data ?? []).toEqual([]);
          expect((await supabase.from(t).select("id").eq("id", mine[t])).data).toEqual([]);
          net.uid = O;
          expect(await present(db, t, mine[t])).toBe(1);
          // the service path (no signed-in user: demo cleanup cron, operator) still deletes
          expect(await probe(db, null, `DELETE FROM public.${t} WHERE id = $1`, [theirs[t]])).toBe(
            "ok:1",
          );
        }
        // confirmed erasure of the caller's own data still works and touches nobody else's rows
        net.uid = V;
        const erase = await supabase.rpc("delete_my_finance_data");
        expect(erase.error).toBeNull();
        net.uid = O;
        for (const t of TABLES) {
          expect(await present(db, t, theirs[t])).toBe(0);
          expect(await present(db, t, mine[t])).toBe(1);
        }

        // statement_line_imports: register a statement, then attack the registration through the API.
        const lacc = await freshAccount(db);
        await importStatement(lacc, "HDFC_Statement_05112026.csv", NOV);
        if (mode.p9) {
          const clear = await api()
            .from("statement_line_imports")
            .update({ registered_at: null })
            .eq("account_key", lacc)
            .select("id");
          expect(clear.error?.message).toMatch(/P9_LINE_CLAIM/);
          const steal = await api()
            .from("statement_line_imports")
            .update({ entry_id: crypto.randomUUID() })
            .eq("account_key", lacc)
            .eq("line_date", "2026-11-01")
            .select("id");
          expect(steal.error?.message).toMatch(/P9_LINE_CLAIM/);
          const forged = await api()
            .from("statement_line_imports")
            .insert({
              account_key: lacc,
              fingerprint: "forged",
              line_date: "2026-11-09",
              batch_id: crypto.randomUUID(),
              entry_id: crypto.randomUUID(),
              registered_at: new Date().toISOString(),
            })
            .select("entry_id,registered_at");
          expect(forged.data).toEqual([{ entry_id: null, registered_at: null }]); // registration columns cleared on a direct insert
          expect(
            (
              await sql1<{ n: number }>(
                db,
                "SELECT count(*)::int n FROM public.statement_line_imports WHERE account_key=$1 AND registered_at IS NOT NULL",
                [lacc],
              )
            )[0]!.n,
          ).toBe(5);
        }
        net.uid = V;
        expect(
          (await supabase.from("statement_line_imports").select("id").eq("account_key", lacc)).data,
        ).toEqual([]);
        expect(
          (
            await supabase
              .from("statement_line_imports")
              .delete()
              .eq("account_key", lacc)
              .select("id")
          ).data ?? [],
        ).toEqual([]);
        net.uid = O;
        expect(await linesFor(db, lacc)).toBe(mode.p9 ? 6 : 5);
        // The owner's own DELETE of line rows is the "Forget last upload" feature and is allowed in both modes. The ledger is still
        // protected: re-importing after the rows are gone saves onto the same stable entry ids. Expected: still 5 rows, 8,331.50.
        const forget = await supabase
          .from("statement_line_imports")
          .delete()
          .eq("account_key", lacc)
          .select("id");
        expect(forget.error).toBeNull();
        expect(await linesFor(db, lacc)).toBe(0);
        const again = await importStatement(lacc, "HDFC_Statement_05112026.csv", NOV);
        expect(again.failed).toEqual([]);
        expect(await ledger(db, lacc)).toMatchObject({ n: 5, total: NOV_TOTAL });
      },
      T,
    );

    it(
      "6. pending receipt: archive (reason), API delete refused, restore, use in a save, cleanup only after the entry holds the bytes; archive history append-only",
      async () => {
        // Injected: API DELETE of the archived staging row; the cleanup called while archived and before the save; a history rewrite,
        // a history drop and a whole-row delete of finance_preferences through the API.
        // Expected with P9: the staging row survives every early attempt (1 row, staging object 2,048 bytes); after the save the entry
        // holds a 2,048-byte copy, cleanup removes the staging row and file only then; history = [archived, restored] and every
        // rewrite/drop/delete leaves it unchanged. Without P9: the same app flow succeeds, but the early cleanup and history rewrite
        // are accepted by the database (recorded in rolled-back probes) — the protection is the interface only.
        reset(db);
        const doc = crypto.randomUUID();
        const staging = `${O}/inbox/${doc}-bill.jpg`;
        const bytes = new Uint8Array(2048).fill(7);
        expect(
          (
            await supabase.storage
              .from("receipts")
              .upload(staging, new Blob([bytes], { type: "image/jpeg" }))
          ).error,
        ).toBeNull();
        expect(
          (
            await supabase
              .from("documents")
              .insert({
                id: doc,
                owner_id: O,
                title: "Receipt to add · bill.jpg",
                file_path: staging,
                file_name: "bill.jpg",
                size_bytes: 2048,
                notes: PENDING_RECEIPT,
              })
              .select("id")
          ).error,
        ).toBeNull();
        const staged = { id: doc, notes: PENDING_RECEIPT, transactionId: null, filePath: staging };
        const objectSize = async (path: string) =>
          (
            await sql1<{ s: string | null }>(
              db,
              "SELECT metadata->>'size' s FROM storage.objects WHERE bucket_id='receipts' AND name=$1",
              [path],
            )
          )[0]?.s ?? null;

        // Archive with a reason (records-archive.ts), saved to owner preferences.
        const at1 = "2026-11-10T09:00:00.000Z",
          at2 = "2026-11-10T09:05:00.000Z";
        expect(
          (
            await writePrefs(
              O,
              archiveTableRecord(await prefsOf(O), "documents", doc, "bill.jpg", {
                by: O,
                at: at1,
                reason: "Duplicate photo",
              }),
            )
          ).error,
        ).toBeNull();
        if (mode.p9) {
          expect(
            (await supabase.from("documents").delete().eq("id", doc).select("id")).error?.message,
          ).toMatch(/P9_ARCHIVE_ONLY/);
          await expect(discardUsedPendingDocument(staged)).rejects.toThrow(
            "Couldn't clear the saved receipt. It is kept; nothing was lost.",
          );
        } else {
          expect(await probe(db, O, "DELETE FROM public.documents WHERE id = $1", [doc])).toBe(
            "ok:1",
          ); // pre-P9: allowed (UI hides archived receipts from Use)
        }
        expect(await present(db, "documents", doc)).toBe(1);
        // Restore with a reason.
        expect(
          (
            await writePrefs(
              O,
              restoreTableRecord(await prefsOf(O), "documents", doc, {
                by: O,
                at: at2,
                reason: "Still needed for the claim",
              }),
            )
          ).error,
        ).toBeNull();
        // Cleanup before the entry holds the bytes: kept (P9 verifies the copy); pre-P9 the database would accept it.
        if (mode.p9)
          await expect(discardUsedPendingDocument(staged)).rejects.toThrow(
            "This receipt isn't saved with an entry yet, so it is kept.",
          );
        else
          expect(
            await probe(
              db,
              O,
              "DELETE FROM public.documents WHERE id = $1 AND notes = $2 AND transaction_id IS NULL",
              [doc, PENDING_RECEIPT],
            ),
          ).toBe("ok:1");
        expect(await present(db, "documents", doc)).toBe(1);
        expect(await objectSize(staging)).toBe("2048");

        // Use it in a save: New entry adds the receipt's bytes to the entry's files, store.save uploads a copy and saves the entry.
        const acc = await freshAccount(db);
        const entry = crypto.randomUUID();
        await storeSave(
          {
            title: "Lunch",
            merchant: "Saravana Bhavan",
            category: "Food and beverages",
            scope: "personal",
            memberId: null,
            amount: 450,
            currency: "INR",
            paymentMethod: "upi",
            date: "2026-11-09",
            description: "",
            txnType: "expense",
            accountId: acc,
            toAccountId: null,
            tags: [],
          },
          { createId: entry, files: [new File([bytes], "bill.jpg", { type: "image/jpeg" })] },
        );
        const saved = (
          await sql1<{ receipts: { name: string; path: string }[]; amount: string }>(
            db,
            "SELECT receipts, amount::text FROM public.expenses WHERE id = $1",
            [entry],
          )
        )[0]!;
        expect(saved.amount).toBe("450.00");
        const copy = saved.receipts[0]!.path;
        expect(copy).not.toBe(staging);
        expect(await objectSize(copy)).toBe("2048");
        // store.removeDocument: verified staging-row cleanup, then the staging file.
        await discardUsedPendingDocument(staged);
        expect((await supabase.storage.from("receipts").remove([staging])).error).toBeNull();
        expect(await present(db, "documents", doc)).toBe(0);
        expect(await objectSize(staging)).toBeNull();
        expect(await objectSize(copy)).toBe("2048"); // the entry still holds the bytes

        // Archive history is append-only.
        const history = (await storedArchive(db, O)) as {
          archiveHistory: { action: string; reason: string }[];
        }[];
        expect(history[0]!.archiveHistory.map((e) => e.action)).toEqual(["archived", "restored"]);
        const rewritten = [
          {
            ...history[0]!,
            archiveHistory: [
              { ...history[0]!.archiveHistory[0]!, reason: "Something else entirely" },
              history[0]!.archiveHistory[1]!,
            ],
          },
        ];
        if (mode.p9) {
          expect(
            (await writePrefs(O, { ...(await prefsOf(O)), recordArchive: rewritten })).error
              ?.message,
          ).toMatch(/P9_ARCHIVE_HISTORY: archive history is append-only/);
          expect(
            (await writePrefs(O, { ...(await prefsOf(O)), recordArchive: [] })).error,
          ).toBeNull(); // accepted, but the stored entry is kept
          expect((await writePrefs(O, {})).error).toBeNull();
          expect(await storedArchive(db, O)).toEqual(history);
        } else {
          expect(
            await probe(
              db,
              O,
              "UPDATE public.finance_preferences SET data = jsonb_set(data, '{recordArchive}', $2::jsonb) WHERE owner_id = $1",
              [O, JSON.stringify(rewritten)],
            ),
          ).toBe("ok:1");
        }
        // Another user can neither read nor change the owner's history.
        net.uid = V;
        expect(
          (await supabase.from("finance_preferences").select("data").eq("owner_id", O)).data,
        ).toEqual([]);
        expect((await writePrefs(O, {})).data ?? []).toEqual([]);
        net.uid = O;
        expect(await storedArchive(db, O)).toEqual(history);
      },
      T,
    );

    it(
      "6b. archive history cannot be truncated by deleting the whole owner-preferences row through the API",
      async () => {
        // Injected: the signed-in owner sends DELETE /rest/v1/finance_preferences?owner_id=eq.<me> (and a raw TRUNCATE), which would
        // erase recordArchive (archive status + history of every loan/goal/commitment/valuation/document) together with the row.
        // Expected (P0-026 / P9 "history is append-only"): refused; the stored history (from test 6: [archived, restored]) is unchanged.
        // Pre-P9 this is recorded only (rolled back): the database accepts it.
        reset(db);
        const before = await storedArchive(db, O);
        expect(Array.isArray(before) && before.length > 0).toBe(true);
        if (!mode.p9) {
          expect(
            await probe(db, O, "DELETE FROM public.finance_preferences WHERE owner_id = $1", [O]),
          ).toBe("ok:1");
          return;
        }
        // RECORDED (not reachable through PostgREST, which never sends TRUNCATE): the authenticated role holds TRUNCATE via the
        // schema's default privileges, and TRUNCATE ignores RLS, so a direct SQL session as "authenticated" could empty every
        // owner's preferences. Recorded before the P0-028 fix as "ok:0"; P9 now also guards TRUNCATE on finance_preferences
        // and expenses (hosted grant check: RB-P1-06). Rolled back here.
        expect(await probe(db, O, "TRUNCATE public.finance_preferences CASCADE")).toMatch(/P9_ARCHIVE_ONLY: finance_preferences records cannot be truncated/);
        // RECORDED: delete-then-insert in one session rewrites history outright (the INSERT has no stored history to compare with).
        const forged = [
          {
            ...(before as Row[])[0]!,
            archiveHistory: [
              {
                action: "archived",
                at: "2026-11-10T09:00:00.000Z",
                by: O,
                reason: "Rewritten reason",
              },
            ],
            archivedAt: "2026-11-10T09:00:00.000Z",
            archivedBy: O,
            archiveReason: "Rewritten reason",
          },
        ];
        const rewrite = await probe(db, O, [
          ["DELETE FROM public.finance_preferences WHERE owner_id = $1", [O]],
          [
            "INSERT INTO public.finance_preferences(owner_id, data) VALUES ($1, jsonb_build_object('recordArchive', $2::jsonb))",
            [O, JSON.stringify(forged)],
          ],
        ]);
        const rowDelete = await supabase
          .from("finance_preferences")
          .delete()
          .eq("owner_id", O)
          .select("owner_id");
        expect(rewrite).toMatch(/P9_/);
        expect(rowDelete.error?.message ?? `deleted ${JSON.stringify(rowDelete.data)}`).toMatch(
          /P9_/,
        );
        expect(await storedArchive(db, O)).toEqual(before);
      },
      T,
    );
  });
}

// ---------------------------------------------------------------------------------------------------------------------------
describe("failure injection on the whole proposed stack (P1, P2, P4, P5, P5b, P6, P7, P8) + P9", () => {
  let db: Db;
  let acc: string;
  beforeAll(async () => {
    db = await fullSchemaDb([...STACK, P9]);
    await seedUsers(db);
    acc = await freshAccount(db);
    // Books activated exactly as src/lib/integration-stack.test.ts does: entities → registers → postings, each with a step-up.
    await sql1(db, "UPDATE public.finance_preferences SET data = $2::jsonb WHERE owner_id = $1", [
      O,
      JSON.stringify({
        entities: [{ id: "c1", name: "Alpha Pvt Ltd", kind: "company" }],
        books: { entityAccounts: { c1: [acc] } },
      }),
    ]);
    const stepUp = async () => {
      await exclusive(async () => {
        await actAs(db, null);
        await db.exec("SET ROLE service_role");
        await db.query("SELECT public.record_step_up($1,'password',300)", [O]);
        await actAs(db, null);
      });
    };
    const asO = <R>(q: string, p: unknown[] = []) =>
      exclusive(async () => {
        await actAs(db, O);
        try {
          return (await db.query<R>(q, p)).rows[0]!;
        } finally {
          await actAs(db, null);
        }
      });
    const ep = (
      await asO<{ p: { source_sha256: string } }>("SELECT public.preview_entity_backfill(false) p")
    ).p;
    await stepUp();
    await asO("SELECT public.commit_entity_backfill($1,false)", [ep.source_sha256]);
    const ap = (
      await asO<{ p: { source_sha256: string } }>(
        "SELECT public.preview_register_backfill('assets','{}') p",
      )
    ).p;
    await stepUp();
    await asO("SELECT public.commit_register_backfill('assets',$1,'{}')", [ap.source_sha256]);
    const pp = (
      await asO<{ p: { fingerprint: string } }>("SELECT public.preview_posting_backfill() p")
    ).p;
    await stepUp();
    await asO("SELECT public.commit_posting_backfill($1,$2)", [
      crypto.randomUUID(),
      pp.fingerprint,
    ]);
  }, T);

  it(
    "2/3 (P7). import with a lost save response, then the same file again, on active books → each line saved, reconciled and posted once",
    async () => {
      // Injected: L2's saveExpense commits and the response is lost; then the same file is uploaded again (retry tap).
      // Expected: 5 ledger rows, 8,331.50; exactly one posting event per imported entry (5); journal balanced; no line reported
      // failed on either tap, and every line confirmed (registered_at set).
      reset(db);
      hook({ op: "server:saveExpense", kind: "lose", nth: 2 });
      const r = await importStatement(acc, "HDFC_Statement_05112026.csv", NOV);
      const r2 = await importStatement(acc, "HDFC_Statement_05112026.csv", NOV);
      const l = await ledger(db, acc);
      expect(l).toMatchObject({ n: 5, total: NOV_TOTAL });
      expect(
        (
          await sql1<{ n: number }>(
            db,
            "SELECT count(*)::int n FROM public.posting_events WHERE owner_id = $1 AND event_key = ANY($2)",
            [O, l.ids.map((x) => `ledger_entry:${x}`)],
          )
        )[0]!.n,
      ).toBe(5);
      expect(
        await sql1(
          db,
          "SELECT batch_id FROM public.posting_lines GROUP BY batch_id, currency HAVING sum(debit) <> sum(credit)",
        ),
      ).toEqual([]);
      expect(net.log.filter((x) => x.includes("-error:"))).toEqual([]);
      expect(r.failed).toEqual([]);
      expect(r2.failed).toEqual([]);
      expect(
        (
          await sql1<{ n: number }>(
            db,
            "SELECT count(*)::int n FROM public.statement_line_imports WHERE account_key=$1 AND registered_at IS NULL",
            [acc],
          )
        )[0]!.n,
      ).toBe(0);
    },
    T,
  );

  // RB-STM-01 (P0-027 residual, KK: "stable source identity including account/workspace scope and content evidence, not filename
  // alone"). The statement_row source key P7 binds is expenses.statement_ref, so it must identify the line by owner (P7 scope) +
  // statement account + content evidence, never by the uploaded file's name.
  const addToBooks = (a: string) =>
    sql1(
      db,
      "UPDATE public.finance_preferences SET data = jsonb_set(data, '{books,entityAccounts,c1}', (data#>'{books,entityAccounts,c1}') || to_jsonb($2::text)) WHERE owner_id = $1",
      [O, a],
    );
  const postedEvents = (ids: string[]) =>
    sql1<{ n: number }>(
      db,
      "SELECT count(*)::int n FROM public.posting_events WHERE owner_id = $1 AND event_key = ANY($2)",
      [O, ids.map((x) => `ledger_entry:${x}`)],
    ).then((r) => r[0]!.n);
  const refsOf = (ids: string[]) =>
    sql1<{ id: string; statement_ref: string | null }>(
      db,
      "SELECT id, statement_ref FROM public.expenses WHERE id = ANY($1) ORDER BY id",
      [ids],
    );
  const AMAZON: StatementLine = { ref: "1", date: "2026-11-03", description: "POS AMAZON RETAIL", amount: 2999, direction: "debit" };

  it(
    "2c (P7). two accounts, statements uploaded under the SAME file name with an identical line → each account's line posted once; re-import adds nothing",
    async () => {
      // Injected: two different statement accounts (savings A, savings B, both in the active books) whose downloads share the file
      // name "statement.csv" and contain the identical line 2026-11-03 POS AMAZON RETAIL 2,999.00 debit (no bank reference).
      // Expected (hand-calculated): A 1 row 2,999.00, B 1 row 2,999.00; 2 posting events; 2 distinct statement_row sources; no
      // reconcile error; then the same two files again → 0 new rows, still 2 events, references unchanged.
      reset(db);
      const a = await freshAccount(db);
      const b = await freshAccount(db);
      await addToBooks(a);
      await addToBooks(b);
      const ra = await importStatement(a, "statement.csv", [AMAZON]);
      const rb = await importStatement(b, "statement.csv", [AMAZON]);
      expect(net.log.filter((x) => x.includes("-error:"))).toEqual([]);
      expect(ra.failed).toEqual([]);
      expect(rb.failed).toEqual([]);
      const la = await ledger(db, a);
      const lb = await ledger(db, b);
      expect(la).toMatchObject({ n: 1, total: 2999 });
      expect(lb).toMatchObject({ n: 1, total: 2999 });
      const ids = [...la.ids, ...lb.ids];
      expect(await postedEvents(ids)).toBe(2);
      const refs = await refsOf(ids);
      expect(refs.every((r) => !!r.statement_ref)).toBe(true);
      expect(new Set(refs.map((r) => r.statement_ref)).size).toBe(2);
      const again = [await importStatement(a, "statement.csv", [AMAZON]), await importStatement(b, "statement.csv", [AMAZON])];
      for (const r of again) {
        expect(r.fresh).toBe(0);
        expect(r.registered).toEqual([]);
      }
      expect(await ledger(db, a)).toMatchObject({ n: 1, total: 2999 });
      expect(await ledger(db, b)).toMatchObject({ n: 1, total: 2999 });
      expect(await postedEvents(ids)).toBe(2);
      expect(await refsOf(ids)).toEqual(refs);
    },
    T,
  );

  it(
    "2d (P7). the same line re-downloaded under a DIFFERENT file name for the same account (after Forget last upload) is the SAME source: no new row, reference unchanged",
    async () => {
      // Injected: register the line from "HDFC_Statement_05112026.csv", Forget last upload (the owner's DELETE of the line rows),
      // then upload the bank's re-download "HDFC_Statement_07112026.csv" with the same line.
      // Expected: 1 row 2,999.00 and 1 posting event throughout; the stored statement_ref (the source identity) is unchanged and
      // contains neither file name; one active statement_row source for the entry.
      reset(db);
      const a = await freshAccount(db);
      await addToBooks(a);
      await importStatement(a, "HDFC_Statement_05112026.csv", [AMAZON]);
      const l = await ledger(db, a);
      expect(l).toMatchObject({ n: 1, total: 2999 });
      const before = await refsOf(l.ids);
      expect(before[0]!.statement_ref).not.toContain("HDFC_Statement");
      const forget = await supabase.from("statement_line_imports").delete().eq("account_key", a).select("id");
      expect(forget.error).toBeNull();
      const r = await importStatement(a, "HDFC_Statement_07112026.csv", [AMAZON]);
      expect(r.failed).toEqual([]);
      expect(await ledger(db, a)).toMatchObject({ n: 1, total: 2999 });
      expect(await postedEvents(l.ids)).toBe(1);
      expect(await refsOf(l.ids)).toEqual(before);
      expect(
        (
          await sql1<{ n: number }>(
            db,
            "SELECT count(*)::int n FROM public.posting_event_sources WHERE owner_id = $1 AND source_kind = 'statement_row' AND source_key = $2 AND released_at IS NULL",
            [O, before[0]!.statement_ref],
          )
        )[0]!.n,
      ).toBe(1);
      // An entry reconciled BEFORE this change holds an older, file-name prefixed reference: it is recognised and kept as stored.
      const old = `HDFC_Statement_05112026.csv · 2026-11-04 · POS DMART · debit 812.40`;
      const b = await freshAccount(db);
      await addToBooks(b);
      const DMART: StatementLine = { ref: "1", date: "2026-11-04", description: "POS DMART", amount: 812.4, direction: "debit" };
      await importStatement(b, "HDFC_Statement_05112026.csv", [DMART]);
      const lb = await ledger(db, b);
      await storeReconcile(lb.ids[0]!, old);
      expect((await supabase.from("statement_line_imports").delete().eq("account_key", b).select("id")).error).toBeNull();
      const rb = await importStatement(b, "HDFC_Statement_08112026.csv", [DMART]);
      expect(rb.failed).toEqual([]);
      expect(rb.added).toEqual([]); // the entry already existed: nothing added
      expect(await ledger(db, b)).toMatchObject({ n: 1, total: 812.4 });
      expect((await refsOf(lb.ids))[0]!.statement_ref).toBe(old);
      expect(await postedEvents(lb.ids)).toBe(1);
    },
    T,
  );

  it(
    "5 (P7). API DELETE of posted entries and of archive-controlled rows is refused on active books; another user matches nothing",
    async () => {
      // Injected: the owner sends DELETE /rest/v1/expenses?id=eq.<posted id> and ?employee_id=eq.<me>; another user tries the same.
      // Fixture: a statement with three distinct lines, 450.00 + 1,234.50 + 649.00 = 2,333.50, on a second account of the same books.
      // Expected: both owner DELETEs refused (P7_POSTED_ENTRY); other user deletes and reads 0 rows; still 3 rows, 2,333.50, 3 posting
      // events; loans/goals/commitments/asset_valuations/documents DELETE refused (P9_ARCHIVE_ONLY).
      reset(db);
      const acc2 = await freshAccount(db);
      await sql1(
        db,
        "UPDATE public.finance_preferences SET data = jsonb_set(data, '{books,entityAccounts,c1}', (data#>'{books,entityAccounts,c1}') || to_jsonb($2::text)) WHERE owner_id = $1",
        [O, acc2],
      );
      const r = await importStatement(acc2, "HDFC_Statement_06112026.csv", [
        NOV[0]!,
        NOV[1]!,
        NOV[4]!,
      ]);
      expect(r.failed).toEqual([]);
      const l = await ledger(db, acc2);
      expect(l).toMatchObject({ n: 3, total: 2333.5 });
      const events = async () =>
        (
          await sql1<{ n: number }>(
            db,
            "SELECT count(*)::int n FROM public.posting_events WHERE owner_id = $1 AND event_key = ANY($2)",
            [O, l.ids.map((x) => `ledger_entry:${x}`)],
          )
        )[0]!.n;
      expect(await events()).toBe(3);
      expect(
        (await supabase.from("expenses").delete().eq("id", l.ids[0]!).select("id")).error?.message,
      ).toMatch(/P7_POSTED_ENTRY/);
      expect(
        (await supabase.from("expenses").delete().eq("employee_id", O).select("id")).error?.message,
      ).toMatch(/P7_POSTED_ENTRY/);
      net.uid = V;
      expect(
        (await supabase.from("expenses").delete().eq("id", l.ids[0]!).select("id")).data ?? [],
      ).toEqual([]);
      expect((await supabase.from("expenses").select("id").eq("id", l.ids[0]!)).data).toEqual([]);
      net.uid = O;
      expect(await ledger(db, acc2)).toMatchObject({ n: 3, total: 2333.5 });
      expect(await events()).toBe(3);
      const rows = await seedArchiveRows(db, O, acc2);
      for (const t of TABLES)
        expect(
          (await supabase.from(t).delete().eq("id", rows[t]).select("id")).error?.message,
        ).toMatch(/P9_ARCHIVE_ONLY/);
      // TRUNCATE of expenses by a direct "authenticated" SQL session (not reachable through PostgREST): refused only because the
      // CASCADE reaches P9-guarded tables (loans/documents reference expenses). Rolled back either way.
      expect(await probe(db, O, "TRUNCATE public.expenses CASCADE")).toMatch(
        /P9_ARCHIVE_ONLY: \w+ records cannot be truncated/,
      );
    },
    T,
  );
});

// ---------------------------------------------------------------------------------------------------------------------------
// RB-LED-01 / P0-005a (unposted path). KK (binding): "For unposted financial records, implement a recoverable Withdraw action
// with reason, retained evidence and audit history. Posted and reconciled records require proper reversal/correction workflows.
// Enforce the distinction server-side." Every case below calls the REAL server function (setEntryWithdrawal → withdrawal.server.ts,
// which calls the P10 functions when installed) and the REAL app removal rule (entry-removal.ts removeEntry, what store.remove
// runs), or sends PostgREST-shaped requests as the signed-in user, against isolated PGlite. The figures are recomputed by the REAL
// readers (txnFromRow + ledgerView + accountBalance / cashflow / netWorth; report-jobs loadOwnerReportData; assistant
// readAssistantFacts) and compared with hand-calculated values.
const P10 = ".lovable/staged-sql/proposed/P10_unposted_entry_withdrawal.sql";
const W_MODES = [
  { name: "before P10 (server function decides)", extra: [P9], p10: false },
  { name: "with P10 (database decides)", extra: [P9, P10], p10: true },
] as const;
const withdrawCall = (id: string, reason: string, action: "withdraw" | "restore" = "withdraw") =>
  setEntryWithdrawal({ data: { id, action, reason } });
const appRemove = (entryId: string, reason: string) =>
  removeEntry({ id: entryId }, { reason }, { mode: async () => "withdraw", reverse: async () => { throw new Error("not posted"); }, withdraw: (id, r) => withdrawCall(id, r) });
async function seedWithdrawFixture(db: Db) {
  // Hand-calculated fixture: HDFC Savings opening 10,000.00; Lunch 450.00 (2 receipt files) and Groceries 1,234.50, both unposted,
  // unreconciled. Balance 10,000.00 − 450.00 − 1,234.50 = 8,315.50; spent 1,684.50; net worth 8,315.50.
  const acc = id(++accSeq);
  await sql1(db, "INSERT INTO public.accounts(id, owner_id, name, kind, opening_balance) VALUES ($1, $2, 'HDFC Savings', 'savings', 10000)", [acc, O]);
  const lunch = crypto.randomUUID(), groceries = crypto.randomUUID();
  const files = [`${O}/${lunch}-bill.jpg`, `${O}/${lunch}-upi.png`];
  for (const f of files)
    await sql1(db, "INSERT INTO storage.objects(bucket_id, name, owner_id, metadata) VALUES ('receipts', $1, $2, '{\"size\": 2048}')", [f, O]);
  const ins = "INSERT INTO public.expenses(id,employee_id,title,merchant,category,amount,original_amount,currency,expense_date,account_id,description,receipts,receipt_details) VALUES ($1,$2,$3,$4,$5,$6,$6,'INR',$7,$8,'',$9::jsonb,$10::jsonb)";
  await sql1(db, ins, [lunch, O, "Lunch", "Saravana Bhavan", "Food and beverages", 450, "2026-11-09", acc, JSON.stringify(files.map((p, i) => ({ name: i ? "upi.png" : "bill.jpg", type: i ? "image/png" : "image/jpeg", path: p }))), JSON.stringify({ tax: 21.43 })]);
  await sql1(db, ins, [groceries, O, "Groceries", "Big Bazaar", "Groceries", 1234.5, "2026-11-08", acc, "[]", "{}"]);
  return { acc, lunch, groceries, files };
}
/** Every figure the app shows, recomputed by the real readers from the database as the signed-in owner. */
async function figures(acc: string) {
  const rows = await supabase.from("expenses").select(LEDGER_COLUMNS).eq("employee_id", net.uid);
  if (rows.error) throw new Error(rows.error.message);
  const view = ledgerView(((rows.data ?? []) as unknown as LedgerRow[]).map(txnFromRow));
  const account: Account = { id: acc, name: "HDFC Savings", kind: "savings", openingBalance: 10000, archived: false };
  const report = await loadOwnerReportData(api() as never, net.uid, "2026-11-10");
  const reportAcc = report.accounts.find((a: { id: string }) => a.id === acc)!;
  const facts = await readAssistantFacts(api() as never, net.uid, defaultPreferences());
  const factAcc = (facts.actual.accounts as { name: string; balance: number }[]).find((a) => a.name === "HDFC Savings");
  return {
    balance: accountBalance(account, view),
    spent: cashflow(view, "2026-11-01", "2026-11-30").spent,
    netWorth: netWorth([account], view).net,
    report: accountBalance(reportAcc as Account, report.transactions as unknown as Txn[]),
    assistant: factAcc?.balance ?? null,
    count: view.length,
  };
}
const rowOf = async (db: Db, entry: string) =>
  (await sql1<Row>(db, "SELECT to_jsonb(e) - 'correction_revision' - 'updated_at' - 'receipt_details' AS j, receipt_details AS rd FROM public.expenses e WHERE id = $1", [entry]))[0] as { j: Row; rd: Row } | undefined;
const objects = async (db: Db, paths: string[]) =>
  (await sql1<{ n: number }>(db, "SELECT count(*)::int n FROM storage.objects WHERE bucket_id = 'receipts' AND name = ANY($1)", [paths]))[0]!.n;

for (const mode of W_MODES) {
  describe(`RB-LED-01 withdraw instead of delete (unposted entries) — ${mode.name}`, () => {
    let db: Db;
    beforeAll(async () => {
      db = await fullSchemaDb([...mode.extra]);
      await seedUsers(db);
    }, T);

    it(
      "W1. Withdraw (app removal path): row and receipt files kept, no DELETE sent, excluded from every reader; Restore counts it again",
      async () => {
        // Expected (hand-calculated): before 8,315.50 / spent 1,684.50 / net worth 8,315.50 in every reader; after withdrawing Lunch
        // (450.00) 8,765.50 / 1,234.50 / 8,765.50; the row is unchanged except receipt_details.withdrawal (who, when, reason) and the
        // revision; both 2,048-byte files remain; no "delete:expenses" or "remove:receipts" request. After Restore 8,315.50 again.
        reset(db);
        const f = await seedWithdrawFixture(db);
        const before = { balance: 8315.5, spent: 1684.5, netWorth: 8315.5, report: 8315.5, assistant: 8315.5, count: 2 };
        expect(await figures(f.acc)).toEqual(before);
        const row0 = await rowOf(db, f.lunch);
        expect(await appRemove(f.lunch, "Entered twice by mistake")).toBe("withdrawn");
        expect(net.log.filter((x) => /delete:expenses|remove:receipts/.test(x))).toEqual([]);
        const row1 = await rowOf(db, f.lunch);
        expect(row1?.j).toEqual(row0?.j); // byte-identical apart from the withdrawal itself
        expect(row1?.rd["tax"]).toBe(21.43); // other receipt details kept
        const w = row1?.rd["withdrawal"] as { state: string; by: string; reason: string; at: string; history: unknown[] };
        expect(w).toMatchObject({ state: "withdrawn", by: O, reason: "Entered twice by mistake" });
        expect(w.at).toMatch(/^2\d{3}-/);
        expect(w.history).toHaveLength(1);
        expect(await objects(db, f.files)).toBe(2);
        expect(await figures(f.acc)).toEqual({ balance: 8765.5, spent: 1234.5, netWorth: 8765.5, report: 8765.5, assistant: 8765.5, count: 1 });
        // A withdrawn entry cannot be edited (server) until restored.
        const edit = await saveExpense({ data: { id: f.lunch, title: "Lunch", merchant: null, category: "Food and beverages", scope: "personal", memberId: null, splits: [], currency: "INR", originalAmount: 999, date: "2026-11-09", description: "", paymentMethod: "upi", txnType: "expense", accountId: f.acc, toAccountId: null, tags: [], receiptDetails: {} } });
        expect(edit).toEqual({ ok: false, error: "This entry is withdrawn. Restore it before editing." });
        expect(await withdrawCall(f.lunch, "Withdrawn by mistake", "restore")).toEqual({ ok: true, replayed: false });
        expect(await figures(f.acc)).toEqual(before);
        const h = (await rowOf(db, f.lunch))?.rd["withdrawal"] as { state: string; history: { action: string }[] };
        expect(h.state).toBe("restored");
        expect(h.history.map((x) => x.action)).toEqual(["withdrawn", "restored"]);
        // An edit after restore keeps the withdrawal history (receipt_details is replaced by the form's copy).
        const edit2 = await saveExpense({ data: { id: f.lunch, title: "Lunch", merchant: null, category: "Food and beverages", scope: "personal", memberId: null, splits: [], currency: "INR", originalAmount: 450, date: "2026-11-09", description: "", paymentMethod: "upi", txnType: "expense", accountId: f.acc, toAccountId: null, tags: [], receiptDetails: { tax: 21.43 } } });
        expect(edit2).toEqual({ ok: true });
        expect(((await rowOf(db, f.lunch))?.rd["withdrawal"] as { history: unknown[] }).history).toHaveLength(2);
        expect(await objects(db, f.files)).toBe(2);
      },
      T,
    );

    it(
      "W2. server distinction: reconciled → refused (correction); repeat → idempotent; other user → refused; short reason → refused",
      async () => {
        reset(db);
        const f = await seedWithdrawFixture(db);
        await sql1(db, "UPDATE public.expenses SET statement_ref = 'Statement line · 2026-11-08 · debit 1234.50 · BIG BAZAAR · account x', reconciled_at = now() WHERE id = $1", [f.groceries]);
        const reconciled = await withdrawCall(f.groceries, "Not mine, wrong account");
        expect(reconciled).toMatchObject({ ok: false, error: expect.stringMatching(/^P10_RECONCILED: .*correction workflow/) });
        await expect(appRemove(f.groceries, "Not mine, wrong account")).rejects.toThrow(/matched to a bank statement line/);
        expect((await rowOf(db, f.groceries))?.rd["withdrawal"]).toBeUndefined();
        expect(await withdrawCall(f.lunch, "Entered twice")).toEqual({ ok: true, replayed: false });
        expect(await withdrawCall(f.lunch, "Entered twice")).toEqual({ ok: true, replayed: true }); // lost response + retry
        expect(await withdrawCall(f.lunch, "Another reason")).toEqual({ ok: true, replayed: true }); // already withdrawn
        expect(((await rowOf(db, f.lunch))?.rd["withdrawal"] as { history: unknown[] }).history).toHaveLength(1);
        expect(await withdrawCall(f.lunch, "abc")).toMatchObject({ ok: false, error: expect.stringMatching(/^P10_REASON/) });
        net.uid = V;
        expect(await withdrawCall(f.groceries, "Somebody else's entry")).toMatchObject({ ok: false, error: expect.stringMatching(/^P10_NOT_FOUND/) });
        expect(await withdrawCall(f.lunch, "Somebody else's entry", "restore")).toMatchObject({ ok: false, error: expect.stringMatching(/^P10_NOT_FOUND/) });
        net.uid = O;
        expect(((await rowOf(db, f.lunch))?.rd["withdrawal"] as { state: string }).state).toBe("withdrawn");
        expect(await withdrawCall(f.groceries, "Never withdrawn", "restore")).toMatchObject({ ok: false, error: expect.stringMatching(/^P10_NOT_WITHDRAWN/) });
      },
      T,
    );

    it(
      "W3. API bypass: DELETE /expenses, forged/dropped withdrawal via PATCH, Statement Desk Undo of a withdrawn entry",
      async () => {
        // Expected with P10: DELETE refused (P10_WITHDRAW_ONLY), forged withdrawal refused, a dropped one kept, a frozen field edit
        // refused; before P10 the database accepts these (recorded in rolled-back probes): the protection is the server function.
        reset(db);
        const f = await seedWithdrawFixture(db);
        await withdrawCall(f.lunch, "Entered twice by mistake");
        if (mode.p10) {
          expect((await supabase.from("expenses").delete().eq("id", f.lunch).select("id")).error?.message).toMatch(/P10_WITHDRAW_ONLY/);
          expect((await supabase.from("expenses").delete().eq("id", f.groceries).select("id")).error?.message).toMatch(/P10_WITHDRAW_ONLY/);
          const forged = await api().from("expenses").update({ receipt_details: { withdrawal: { state: "restored", at: "2026-01-01", by: O, reason: "forged!", history: [] } } }).eq("id", f.lunch).select("id");
          expect(forged.error?.message).toMatch(/P10_WITHDRAWAL_ONLY_BY_FUNCTION/);
          const dropped = await api().from("expenses").update({ receipt_details: {} }).eq("id", f.lunch).select("id");
          expect(dropped.error).toBeNull();
          expect(((await rowOf(db, f.lunch))?.rd["withdrawal"] as { state: string }).state).toBe("withdrawn");
          expect((await api().from("expenses").update({ amount: 1 }).eq("id", f.lunch).select("id")).error?.message).toMatch(/P10_WITHDRAWN/);
          expect((await api().from("expenses").update({ receipt_details: { withdrawal: { state: "withdrawn" } } }).eq("id", f.groceries).select("id")).error?.message).toMatch(/P10_WITHDRAWAL_ONLY_BY_FUNCTION/);
          expect(await probe(db, O, "TRUNCATE public.expenses CASCADE")).toMatch(/P10_WITHDRAW_ONLY|P9_/);
          // INSERT: a forged withdrawal is refused; a complete valid history (backup restore keeps history) is accepted.
          const base = { employee_id: O, title: "x", category: "Groceries", amount: 10, original_amount: 10, currency: "INR", expense_date: "2026-11-01", description: "" };
          expect((await api().from("expenses").insert({ ...base, id: crypto.randomUUID(), receipt_details: { withdrawal: { state: "withdrawn" } } }).select("id")).error?.message).toMatch(/P10_WITHDRAWAL_ONLY_BY_FUNCTION/);
          const ev = { action: "withdrawn", at: "2026-11-01T10:00:00.000Z", by: O, reason: "Entered twice" };
          expect((await api().from("expenses").insert({ ...base, id: crypto.randomUUID(), receipt_details: { withdrawal: { state: "withdrawn", at: ev.at, by: O, reason: ev.reason, history: [ev] } } }).select("id")).error).toBeNull();
        } else {
          expect(await probe(db, O, "DELETE FROM public.expenses WHERE id = $1", [f.lunch])).toBe("ok:1"); // gap closed by P10
          expect(await probe(db, O, "UPDATE public.expenses SET receipt_details = '{}' WHERE id = $1", [f.lunch])).toBe("ok:1");
        }
        expect(await present(db, "expenses", f.lunch)).toBe(1);
        expect(await present(db, "expenses", f.groceries)).toBe(1);
        // Statement Desk Undo of an upload whose entry was later withdrawn: refused, nothing committed.
        const rows = (await supabase.from("expenses").select("*").in("id", [f.lunch])).data as Row[];
        let committed = false;
        await expect(atomicStatementUndo("00000000-0000-4000-8000-00000000aa01", { posted: [f.lunch], reconciled: [] }, [{ id: f.lunch, ref: null, revision: 0 }], {
          receipt: async () => false, rows: async () => rows, commit: async () => { committed = true; },
        })).rejects.toThrow(/was withdrawn\. It is kept in history/);
        expect(committed).toBe(false);
      },
      T,
    );
  });
}

/** Books activated exactly as the P7 describe above does: entities → registers → postings, each with a step-up. */
async function activateBooks(db: Db, acc: string) {
  await sql1(db, "UPDATE public.finance_preferences SET data = $2::jsonb WHERE owner_id = $1", [O, JSON.stringify({ entities: [{ id: "c1", name: "Alpha Pvt Ltd", kind: "company" }], books: { entityAccounts: { c1: [acc] } } })]);
  const stepUp = () => exclusive(async () => { await actAs(db, null); await db.exec("SET ROLE service_role"); await db.query("SELECT public.record_step_up($1,'password',300)", [O]); await actAs(db, null); });
  const asO = <R>(q: string, p: unknown[] = []) => exclusive(async () => { await actAs(db, O); try { return (await db.query<R>(q, p)).rows[0]!; } finally { await actAs(db, null); } });
  const ep = (await asO<{ p: { source_sha256: string } }>("SELECT public.preview_entity_backfill(false) p")).p;
  await stepUp();
  await asO("SELECT public.commit_entity_backfill($1,false)", [ep.source_sha256]);
  const ap = (await asO<{ p: { source_sha256: string } }>("SELECT public.preview_register_backfill('assets','{}') p")).p;
  await stepUp();
  await asO("SELECT public.commit_register_backfill('assets',$1,'{}')", [ap.source_sha256]);
  const pp = (await asO<{ p: { fingerprint: string } }>("SELECT public.preview_posting_backfill() p")).p;
  await stepUp();
  await asO("SELECT public.commit_posting_backfill($1,$2)", [crypto.randomUUID(), pp.fingerprint]);
}
for (const withP10 of [false, true]) {
  describe(`RB-LED-01 posted entries are reversed, never withdrawn — P1..P9${withP10 ? " + P10" : " (server function decides)"}`, () => {
    let db: Db;
    let acc: string;
    beforeAll(async () => {
      db = await fullSchemaDb([...STACK, P9, ...(withP10 ? [P10] : [])]);
      await seedUsers(db);
      acc = await freshAccount(db);
      await activateBooks(db, acc);
    }, T);
    it(
      "W4. a posted entry: Withdraw refused (P10_POSTED → Reverse entry) by the server and the app rule; posting and row unchanged",
      async () => {
        // Expected: the entry (450.00 on the books account) has 1 posting event; withdraw → refused; removeEntry asks for a
        // reversal reason (ReversalReasonRequired); still 1 event, no withdrawal stored. With P10 a raw DELETE is refused too.
        reset(db);
        const entry = crypto.randomUUID();
        await storeSave({ title: "Lunch", merchant: "Saravana Bhavan", category: "Food and beverages", scope: "personal", memberId: null, amount: 450, currency: "INR", paymentMethod: "upi", date: "2026-11-09", description: "", txnType: "expense", accountId: acc, toAccountId: null, tags: [] }, { createId: entry });
        const events = async () => (await sql1<{ n: number }>(db, "SELECT count(*)::int n FROM public.posting_events WHERE owner_id = $1 AND event_key = $2", [O, `ledger_entry:${entry}`]))[0]!.n;
        expect(await events()).toBe(1);
        expect(await withdrawCall(entry, "Entered twice by mistake")).toMatchObject({ ok: false, error: expect.stringMatching(/^P10_POSTED: .*Reverse/) });
        await expect(appRemove(entry, "Entered twice by mistake")).rejects.toBeInstanceOf(ReversalReasonRequired);
        expect(await events()).toBe(1);
        expect((await rowOf(db, entry))?.rd?.["withdrawal"]).toBeUndefined();
        if (withP10) expect((await supabase.from("expenses").delete().eq("id", entry).select("id")).error?.message).toMatch(/P10_WITHDRAW_ONLY|P7_POSTED_ENTRY/);
        expect(await present(db, "expenses", entry)).toBe(1);
      },
      T,
    );
  });
}

// ---------------------------------------------------------------------------------------------------------------------------
// P0-023 (KK, binding): "Repeated backup restoration must be detected and never execute silently. Default to no change, show
// previous restore evidence and require explicit authorised action." + P0-033 (an older backup never resurrects a withdrawn
// entry). The REAL app restore step (restore-guard.ts guardedRestore, what Settings → Restore runs after planning) over
// PostgREST-shaped requests as the signed-in owner; with P11 the database functions decide.
const P11 = ".lovable/staged-sql/proposed/P11_backup_restore_receipts.sql";
const R_MODES = [
  { name: "applied schema (app rule; history in owner preferences)", extra: [P9], p10: false, p11: false },
  { name: "with P10", extra: [P9, P10], p10: true, p11: false },
  { name: "with P10 + P11 (database decides)", extra: [P9, P10, P11], p10: true, p11: true },
] as const;
async function exportOwner(db: Db, owner: string): Promise<Backup> {
  const data: Backup["data"] = {};
  for (const t of BACKUP_TABLES)
    data[t] = (await sql1<{ j: BackupRow }>(db, `SELECT to_jsonb(x) j FROM public.${t} x WHERE ${t === "expenses" ? "employee_id" : "owner_id"} = $1 ORDER BY 1`, [owner])).map((r) => r.j);
  return { app: "ledgerline", version: 3, owner, exportedAt: "2026-11-10", data };
}
const restoreApi = () => api() as unknown as RestoreDb;
for (const mode of R_MODES) {
  describe(`P0-023 repeated backup restore / P0-033 withdrawn entries — ${mode.name}`, () => {
    let db: Db;
    beforeAll(async () => {
      db = await fullSchemaDb([...mode.extra]);
      await seedUsers(db);
    }, T);

    it(
      "R1. the same backup again: nothing changes and the earlier restore is shown; only an explicit re-restore with a reason proceeds, and is recorded",
      async () => {
        // Expected: 1st restore → "restored"; the owner then edits Lunch 450.00 → 500.00; the same backup again → previously_restored,
        // changed false, 1 earlier restore (by the owner, record count = rows in the backup), Lunch still 500.00; re-restore with
        // reason → restored_again, Lunch 450.00, 2 restore records (first, again + reason); a short reason is refused, nothing written.
        reset(db);
        const f = await seedWithdrawFixture(db);
        const backup = await exportOwner(db, O);
        const plan = await planRestore(backup, O, { stageFiles: true });
        const total = Object.values(plan.data).reduce((s, r) => s + (r?.length ?? 0), 0);
        const first = await guardedRestore({ owner: O, data: plan.data }, restoreApi());
        expect(first).toMatchObject({ status: "restored", changed: true, previous: [] });
        expect((await api().from("expenses").update({ amount: 500, original_amount: 500 }).eq("id", f.lunch).select("id")).error).toBeNull();
        const again = await guardedRestore({ owner: O, data: (await planRestore(backup, O, { stageFiles: true })).data }, restoreApi());
        expect(again.status).toBe("previously_restored");
        expect(again.changed).toBe(false);
        expect(again.previous).toHaveLength(1);
        expect(again.previous[0]).toMatchObject({ by: O, mode: "first", reason: null });
        expect(total).toBe(4); // preferences 1 + account 1 + entries 2
        expect(again.previous[0]!.records).toBe(4);
        expect(previousRestoreLine(again.previous, O)).toMatch(/^Restored on .* by you \(\d+ records\)$/);
        expect((await rowOf(db, f.lunch))?.j["amount"]).toBe(500);
        await expect(guardedRestore({ owner: O, data: plan.data, rerestoreReason: "abc" }, restoreApi())).rejects.toThrow(/at least 5 characters/);
        expect((await rowOf(db, f.lunch))?.j["amount"]).toBe(500);
        const re = await guardedRestore({ owner: O, data: plan.data, rerestoreReason: "Edited Lunch by mistake" }, restoreApi());
        expect(re).toMatchObject({ status: "restored_again", changed: true });
        expect((await rowOf(db, f.lunch))?.j["amount"]).toBe(450);
        const recs = mode.p11
          ? await sql1<{ mode: string; reason: string | null }>(db, "SELECT mode, reason FROM public.backup_restore_receipts WHERE owner_id = $1 ORDER BY restored_at", [O])
          : ((await storedPrefs(db, O))["restoreHistory"] as { mode: string; reason: string | null }[]).map((r) => ({ mode: r.mode, reason: r.reason }));
        expect(recs).toEqual([{ mode: "first", reason: null }, { mode: "again", reason: "Edited Lunch by mistake" }]);
      },
      T,
    );

    it(
      "R2. P0-033: an older backup (taken before the withdrawal) never resurrects a withdrawn entry; a restored entry keeps its withdrawal history",
      async () => {
        // Expected (hand-calculated): fixture balance 8,315.50; Lunch 450.00 withdrawn → 8,765.50; restoring the older backup (first time)
        // → Lunch still withdrawn, balance 8,765.50; Groceries restored then re-withdrawn/restored history is kept as stored.
        reset(db);
        const f = await seedWithdrawFixture(db);
        const older = await exportOwner(db, O);
        expect(await withdrawCall(f.lunch, "Entered twice by mistake")).toMatchObject({ ok: true });
        expect(await withdrawCall(f.groceries, "Wrong account")).toMatchObject({ ok: true });
        expect(await withdrawCall(f.groceries, "Right account after all", "restore")).toMatchObject({ ok: true });
        const before = await figures(f.acc);
        expect(before.balance).toBe(8765.5); // 10,000.00 − 1,234.50 (Lunch 450.00 withdrawn)
        const r = await guardedRestore({ owner: O, data: (await planRestore(older, O, { stageFiles: true })).data }, restoreApi());
        expect(r.status).toBe("restored");
        expect(((await rowOf(db, f.lunch))?.rd["withdrawal"] as { state: string }).state).toBe("withdrawn");
        expect(((await rowOf(db, f.groceries))?.rd["withdrawal"] as { history: unknown[] }).history).toHaveLength(2);
        expect(await figures(f.acc)).toEqual(before);
      },
      T,
    );

    it(
      "R3. direct API call of the unchecked restore: refused with P11; recorded as a gap without P11",
      async () => {
        reset(db);
        await seedWithdrawFixture(db);
        const plan = await planRestore(await exportOwner(db, O), O, { stageFiles: true });
        const direct = await supabase.rpc("restore_finance_backup", { payload: plan.data as unknown as Json });
        if (mode.p11) expect(direct.error?.message).toMatch(/P11_RESTORE_CHECK_REQUIRED/);
        // Without P11 the database cannot tell a repeat (gap closed by P11). With P10 alone the direct call still fails closed here,
        // because the payload stages new receipt paths onto an entry withdrawn in R2 (frozen while withdrawn); guardedRestore keeps it.
        else if (mode.p10) expect(direct.error?.message).toMatch(/P10_WITHDRAWN/);
        else expect(direct.error?.message ?? null).toBeNull();
      },
      T,
    );
  });
}
const storedPrefs = async (db: Db, owner: string) =>
  ((await sql1<{ d: Record<string, unknown> }>(db, "SELECT data d FROM public.finance_preferences WHERE owner_id = $1", [owner]))[0]?.d ?? {}) as Record<string, unknown>;

describe("R-P10-1: activating balanced books after a withdrawal — P1..P9 + P10", () => {
  it(
    "W5. a withdrawn entry stays unposted through the posting backfill; Restore posts it; once posted it can no longer be withdrawn",
    async () => {
      // Expected: two unposted entries before activation (Lunch 450.00 withdrawn, Groceries 1,234.50 kept); after the backfill
      // 1 posting event (Groceries only), journal balanced; Restore of Lunch posts it → 2 events; withdrawing a posted entry refused.
      const db = await fullSchemaDb([...STACK, P9, P10]);
      await seedUsers(db);
      reset(db);
      const f = await seedWithdrawFixture(db);
      expect(await withdrawCall(f.lunch, "Entered twice by mistake")).toMatchObject({ ok: true });
      await activateBooks(db, f.acc);
      const events = async (id: string) => (await sql1<{ n: number }>(db, "SELECT count(*)::int n FROM public.posting_events WHERE owner_id = $1 AND event_key = $2", [O, `ledger_entry:${id}`]))[0]!.n;
      expect(await events(f.lunch)).toBe(0);
      expect(await events(f.groceries)).toBe(1);
      expect(await sql1(db, "SELECT batch_id FROM public.posting_lines GROUP BY batch_id, currency HAVING sum(debit) <> sum(credit)")).toEqual([]);
      expect(await withdrawCall(f.lunch, "Withdrawn by mistake", "restore")).toMatchObject({ ok: true });
      expect(await events(f.lunch)).toBe(1);
      expect(await withdrawCall(f.lunch, "Entered twice by mistake")).toMatchObject({ ok: false, error: expect.stringMatching(/^P10_POSTED/) });
      await db.close();
    },
    T,
  );
});

// ---------------------------------------------------------------------------------------------------------------------------
// P0-022 (KK, binding): "Team users cannot permanently delete financial records or audit history. Allow permission-scoped
// requests for withdrawal or correction, with authorised approval where consequential. Enforce permissions server-side and
// preserve entity separation." Each request below is a PostgREST-shaped call as that signed-in user (owner O, manager M with
// the edit/delete switches, Finance F with "approve", unrelated user X), through the app helpers in entry-requests.ts.
const P13 = ".lovable/staged-sql/proposed/P13_team_change_requests.sql";
const M = id(3), F = id(4), X = id(5);
describe("P0-022 team users: no deletes, permission-scoped requests, authorised approval — P9 + P10 + P13", () => {
  let db: Db;
  beforeAll(async () => {
    db = await fullSchemaDb([P9, P10, P13]);
    await seedUsers(db);
    await addUsers(db, { [M]: "m@x.in", [F]: "f@x.in", [X]: "x@x.in" });
    await sql1(db, "INSERT INTO public.user_roles(user_id, role) VALUES ($1,'manager'),($2,'finance')", [M, F]);
    await sql1(db, "UPDATE public.role_permissions SET allowed = true WHERE (role = 'manager' AND action IN ('view_expenses','edit_expenses','delete_expenses')) OR (role = 'finance' AND action IN ('view_expenses','approve'))");
  }, T);

  it(
    "T1. a team member's API DELETE and money edit are refused; audit rows cannot be deleted or truncated; the owner's figures are unchanged",
    async () => {
      // Expected (hand-calculated): owner's HDFC Savings 10,000.00 − 450.00 − 1,234.50 = 8,315.50 before and after every attempt.
      reset(db);
      const f = await seedWithdrawFixture(db);
      net.uid = M;
      expect((await supabase.from("expenses").select("id").eq("id", f.lunch)).data).toEqual([{ id: f.lunch }]); // can view (switch)
      const del = await supabase.from("expenses").delete().eq("id", f.lunch).select("id");
      expect(del.error?.message ?? `deleted ${JSON.stringify(del.data)}`).toMatch(/P10_WITHDRAW_ONLY|deleted \[\]/);
      expect((await api().from("expenses").update({ amount: 1, original_amount: 1 }).eq("id", f.lunch).select("id")).error?.message).toMatch(/P13_REQUEST_REQUIRED/);
      expect((await api().from("transaction_audit").delete().eq("transaction_id", f.lunch).select("id")).data ?? []).toEqual([]);
      expect(await probe(db, M, "TRUNCATE public.transaction_audit")).toMatch(/P13_AUDIT_KEPT|permission denied/);
      net.uid = O;
      expect(await probe(db, O, "TRUNCATE public.expense_history CASCADE")).toMatch(/P13_AUDIT_KEPT|permission denied/);
      expect(await present(db, "expenses", f.lunch)).toBe(1);
      expect((await figures(f.acc)).balance).toBe(8315.5);
    },
    T,
  );

  it(
    "T2. withdrawal request → owner approves: withdrawn with requester and approver recorded, excluded from figures; the requester cannot decide; others cannot see or ask",
    async () => {
      // Expected: after approval HDFC Savings 10,000.00 − 1,234.50 = 8,765.50; Lunch's withdrawal names approver O and requester M.
      reset(db);
      const f = await seedWithdrawFixture(db);
      net.uid = X;
      await expect(requestEntryChange({ entryId: f.lunch, kind: "withdraw", reason: "Duplicate entry" })).rejects.toThrow(/can't ask for or decide/);
      net.uid = M;
      const rid = await requestEntryChange({ entryId: f.lunch, kind: "withdraw", reason: "Duplicate of the Swiggy order" });
      await expect(requestEntryChange({ entryId: f.lunch, kind: "withdraw", reason: "Again please" })).rejects.toThrow(/already has a request waiting/);
      await expect(decideEntryChange({ requestId: rid, approve: true, reason: "Approving my own" })).rejects.toThrow(/can't ask for or decide/);
      expect((await listEntryChanges("pending")).map((r) => r.id)).toEqual([rid]);
      net.uid = X;
      expect(await listEntryChanges()).toEqual([]);
      net.uid = O;
      expect((await listEntryChanges("pending")).map((r) => [r.kind, r.requestedBy])).toEqual([["withdraw", M]]);
      expect(await decideEntryChange({ requestId: rid, approve: true, reason: "Agreed, it is a duplicate" })).toMatchObject({ status: "approved", replayed: false });
      const w = (await rowOf(db, f.lunch))?.rd["withdrawal"] as { state: string; by: string; history: { requestId: string; requestedBy: string }[] };
      expect(w).toMatchObject({ state: "withdrawn", by: O });
      expect(w.history[0]).toMatchObject({ requestId: rid, requestedBy: M });
      expect((await figures(f.acc)).balance).toBe(8765.5);
      expect(await objects(db, f.files)).toBe(2); // receipt files kept
      expect(await decideEntryChange({ requestId: rid, approve: false, reason: "Second click" })).toMatchObject({ status: "approved", replayed: true });
    },
    T,
  );

  it(
    "T3. correction request → Finance approves (consequential amount change); a rejected request changes nothing; reconciled entries keep amount and date",
    async () => {
      // Expected: Groceries 1,234.50 → 1,250.00 after Finance approves: balance 10,000.00 − 450.00 − 1,250.00 = 8,300.00;
      // a rejected title change leaves the title; a reconciled entry's amount request is refused at approval (P10_RECONCILED).
      reset(db);
      const f = await seedWithdrawFixture(db);
      net.uid = M;
      await expect(requestEntryChange({ entryId: f.groceries, kind: "correct", reason: "Wrong account", changes: { account_id: "x" } as never })).rejects.toThrow(/cannot be changed by a correction request/);
      const r1 = await requestEntryChange({ entryId: f.groceries, kind: "correct", reason: "Bill says 1,250.00", changes: { amount: 1250 } });
      net.uid = F;
      expect(await decideEntryChange({ requestId: r1, approve: true, reason: "Checked against the bill" })).toMatchObject({ status: "approved" });
      expect((await rowOf(db, f.groceries))?.j).toMatchObject({ amount: 1250, original_amount: 1250 });
      net.uid = O;
      expect((await figures(f.acc)).balance).toBe(8300);
      net.uid = M;
      const r2 = await requestEntryChange({ entryId: f.lunch, kind: "correct", reason: "Better title", changes: { title: "Team lunch" } });
      net.uid = O;
      expect(await decideEntryChange({ requestId: r2, approve: false, reason: "Title is right as it is" })).toMatchObject({ status: "rejected" });
      expect((await rowOf(db, f.lunch))?.j["title"]).toBe("Lunch");
      await sql1(db, "UPDATE public.expenses SET statement_ref = 'Statement line · 2026-11-09 · debit 450.00 · SARAVANA · account x', reconciled_at = now() WHERE id = $1", [f.lunch]);
      net.uid = M;
      const r3 = await requestEntryChange({ entryId: f.lunch, kind: "correct", reason: "Bill says 470.00", changes: { amount: 470 } });
      net.uid = O;
      await expect(decideEntryChange({ requestId: r3, approve: true, reason: "Approve anyway" })).rejects.toThrow(/corrected, not withdrawn|matched to a bank statement/);
      expect((await rowOf(db, f.lunch))?.j["amount"]).toBe(450);
    },
    T,
  );
});

// ---------------------------------------------------------------------------------------------------------------------------
// P0-015 (KK, binding): "Asset disposal requires owner or explicitly authorised financial approval, with source evidence,
// reason, disposal date, proceeds, accounting entries and audit trail. Archiving never constitutes disposal." The REAL server
// functions (asset-disposal.functions.ts → asset-disposal.ts, book value from assets-ledger.ts) and PostgREST-shaped requests
// as each signed-in user. Hand-calculated fixture: Laptop cost 60,000.00, put to use 2026-04-01, straight line 20% a year =
// 1,000.00 a month; disposed 2026-10-31 → 7 months → book value 53,000.00; sale proceeds 50,000.00 → loss 3,000.00. Its ledger
// asset account carries the book value 53,000.00 (depreciation already in the books); after approval it reads 0.00.
const P14 = ".lovable/staged-sql/proposed/P14_asset_disposal_approval.sql";
async function seedAsset(db: Db, owner = O) {
  const assetAcc = id(++accSeq), bank = id(++accSeq), doc = crypto.randomUUID(), proceedsEntry = crypto.randomUUID();
  await sql1(db, "INSERT INTO public.accounts(id, owner_id, name, kind, opening_balance) VALUES ($1,$3,'Fixed assets','other_asset',53000),($2,$3,'HDFC Current','current',0)", [assetAcc, bank, owner]);
  await sql1(db, "INSERT INTO public.documents(id, owner_id, title, file_path, file_name, size_bytes, notes) VALUES ($1,$2,'Laptop sale invoice',$3,'sale.pdf',1000,'')", [doc, owner, `${owner}/docs/${doc}-sale.pdf`]);
  await sql1(db, "INSERT INTO public.expenses(id,employee_id,title,category,amount,original_amount,currency,expense_date,account_id,description,txn_type) VALUES ($1,$2,'Laptop sale proceeds','Asset sale',50000,50000,'INR','2026-10-31',$3,'','income')", [proceedsEntry, owner, bank]);
  const asset = { id: `ast-${crypto.randomUUID().slice(0, 8)}`, name: "Laptop", kind: "computer", cost: 60000, inUse: "2026-04-01", sharePct: 100, bookMethod: "slm", bookRatePct: 20, accountId: assetAcc, tag: "LAP-1" };
  await sql1(db, "UPDATE public.finance_preferences SET data = jsonb_set(coalesce(data, '{}'), '{assets}', coalesce(data->'assets', '[]') || $2::jsonb) WHERE owner_id = $1", [owner, JSON.stringify([asset])]);
  return { asset, assetAcc, bank, doc, proceedsEntry };
}
const assetNow = async (db: Db, owner: string, assetId: string) =>
  (await sql1<{ a: Record<string, unknown> }>(db, "SELECT a FROM public.finance_preferences p, jsonb_array_elements(p.data->'assets') a WHERE p.owner_id = $1 AND a->>'id' = $2", [owner, assetId]))[0]?.a;
const accountBalanceOf = async (db: Db, owner: string, accId: string, kind: Account["kind"], opening: number) => {
  const rows = await sql1<{ j: LedgerRow }>(db, "SELECT to_jsonb(e) j FROM public.expenses e WHERE employee_id = $1", [owner]);
  return accountBalance({ id: accId, name: "x", kind, openingBalance: opening, archived: false }, ledgerView(rows.map((r) => txnFromRow(r.j))));
};
const disposalInput = (s: Awaited<ReturnType<typeof seedAsset>>, extra: Record<string, unknown> = {}) =>
  ({ assetId: s.asset.id, method: "sale" as const, date: "2026-10-31", proceeds: 50000, proceedsEntryId: s.proceedsEntry, evidence: [s.doc], reason: "Sold to the dealer, invoice attached", ...extra });

describe("P0-015 asset disposal approval — P9 + P14 (applied schema)", () => {
  let db: Db;
  beforeAll(async () => {
    db = await fullSchemaDb([P9, P14]);
    await seedUsers(db);
    await addUsers(db, { [M]: "m@x.in", [F]: "f@x.in", [X]: "x@x.in" });
    await sql1(db, "INSERT INTO public.user_roles(user_id, role) VALUES ($1,'manager'),($2,'finance')", [M, F]);
    await sql1(db, "UPDATE public.role_permissions SET allowed = true WHERE role = 'finance' AND action IN ('view_expenses','approve')");
  }, T);

  it(
    "D1. no disposal outside the approval: a direct Sold-on edit, a disposal entry and archiving never dispose; the asset and figures are unchanged",
    async () => {
      reset(db);
      const s = await seedAsset(db);
      const prefs = await prefsOf(O);
      const sold = { ...prefs, assets: (prefs.assets as unknown as Record<string, unknown>[]).map((a) => (a["id"] === s.asset.id ? { ...a, soldOn: "2026-10-31", saleValue: 50000 } : a)) };
      expect((await writePrefs(O, sold)).error?.message).toMatch(/P14_DISPOSAL_APPROVAL_REQUIRED/);
      const entry = { id: crypto.randomUUID(), employee_id: O, title: "Disposal · Laptop", category: "Asset disposal", amount: 53000, original_amount: 53000, currency: "INR", expense_date: "2026-10-31", account_id: s.assetAcc, description: "", txn_type: "adjustment", adjustment_sign: -1, tags: ["disposal"] };
      expect((await api().from("expenses").insert(entry).select("id")).error?.message).toMatch(/P14_DISPOSAL_APPROVAL_REQUIRED/);
      // archiving the asset (status only, with a reason) is accepted and leaves it in the register, not disposed
      const archived = { ...prefs, assets: (prefs.assets as unknown as Record<string, unknown>[]).map((a) => (a["id"] === s.asset.id ? { ...a, archived: true, archivedAt: "2026-11-01T00:00:00Z", archivedBy: O, archiveReason: "No longer in use" } : a)) };
      expect((await writePrefs(O, archived)).error).toBeNull();
      expect(await assetNow(db, O, s.asset.id)).toMatchObject({ archived: true });
      expect((await assetNow(db, O, s.asset.id))?.["soldOn"]).toBeUndefined();
      expect(await accountBalanceOf(db, O, s.assetAcc, "other_asset", 53000)).toBe(53000);
    },
    T,
  );

  it(
    "D2. request (evidence, reason, date, proceeds) → owner approves: asset disposed with its record, one disposal entry 53,000.00, asset account 0.00, audit kept",
    async () => {
      reset(db);
      const s = await seedAsset(db);
      expect(await requestAssetDisposal({ data: disposalInput(s, { evidence: [crypto.randomUUID()] }) })).toMatchObject({ ok: false, error: expect.stringMatching(/disposal evidence/) });
      expect(await requestAssetDisposal({ data: { ...disposalInput(s), reason: "abc" } }).catch((e: Error) => ({ ok: false, error: e.message }))).toMatchObject({ ok: false });
      const req = await requestAssetDisposal({ data: disposalInput(s) });
      expect(req).toMatchObject({ ok: true, plan: { bookValue: 53000, proceeds: 50000, gain: -3000, problems: [] } });
      const requestId = (req as { requestId: string }).requestId;
      expect(await requestAssetDisposal({ data: disposalInput(s) })).toMatchObject({ ok: false, error: expect.stringMatching(/already has an open disposal request/) });
      net.uid = X;
      expect(await decideAssetDisposal({ data: { requestId, approve: true, reason: "Looks fine to me" } })).toMatchObject({ ok: false, error: expect.stringMatching(/Only the owner/) });
      expect((await api().from("asset_disposal_requests").select("id")).data).toEqual([]);
      net.uid = O;
      const dec = await decideAssetDisposal({ data: { requestId, approve: true, reason: "Approved: invoice checked" } });
      expect(dec).toMatchObject({ ok: true, status: "approved", entry: (req as { entryId: string }).entryId, replayed: false });
      expect(await assetNow(db, O, s.asset.id)).toMatchObject({ soldOn: "2026-10-31", saleValue: 50000, disposal: { requestId, method: "sale", approvedBy: O, bookValue: 53000, proceeds: 50000, gain: -3000, evidence: [s.doc], proceedsEntryId: s.proceedsEntry } });
      const e = (await sql1<{ j: Record<string, unknown> }>(db, "SELECT to_jsonb(e) j FROM public.expenses e WHERE id = $1", [(req as { entryId: string }).entryId]))[0]!.j;
      expect(e).toMatchObject({ amount: 53000, txn_type: "adjustment", adjustment_sign: -1, account_id: s.assetAcc, category: "Asset disposal", tags: ["disposal"], expense_date: "2026-10-31" });
      expect(await accountBalanceOf(db, O, s.assetAcc, "other_asset", 53000)).toBe(0);
      expect(await accountBalanceOf(db, O, s.bank, "current", 0)).toBe(50000);
      expect(await decideAssetDisposal({ data: { requestId, approve: false, reason: "Second click" } })).toMatchObject({ ok: true, status: "approved", replayed: true });
      expect(await requestAssetDisposal({ data: disposalInput(s) })).toMatchObject({ ok: false, error: expect.stringMatching(/disposed on 2026-10-31/) });
      expect((await api().from("asset_disposal_requests").update({ status: "rejected" }).eq("id", requestId).select("id")).data ?? []).toEqual([]);
      expect(await probe(db, O, "DELETE FROM public.asset_disposal_requests")).toMatch(/ok:0|P14_AUDIT_KEPT|permission denied/);
      expect((await sql1<{ s: string }>(db, "SELECT status s FROM public.asset_disposal_requests WHERE id = $1", [requestId]))[0]!.s).toBe("approved");
    },
    T,
  );

  it(
    "D3. Finance approval: a Finance user with 'approve' decides; a register change after the request refuses approval; a rejection disposes nothing",
    async () => {
      reset(db);
      const s = await seedAsset(db);
      const r1 = (await requestAssetDisposal({ data: disposalInput(s) })) as { requestId: string };
      // the register changes (cost corrected) after the request → approval refused, nothing written
      const prefs = await prefsOf(O);
      expect((await writePrefs(O, { ...prefs, assets: (prefs.assets as unknown as Record<string, unknown>[]).map((a) => (a["id"] === s.asset.id ? { ...a, cost: 61000 } : a)) })).error).toBeNull();
      net.uid = F;
      expect(await decideAssetDisposal({ data: { requestId: r1.requestId, approve: true, reason: "Checked the invoice" } })).toMatchObject({ ok: false, error: expect.stringMatching(/changed since the request/) });
      expect(await decideAssetDisposal({ data: { requestId: r1.requestId, approve: false, reason: "Cost changed, ask again" } })).toMatchObject({ ok: true, status: "rejected" });
      net.uid = O;
      expect((await assetNow(db, O, s.asset.id))?.["soldOn"]).toBeUndefined();
      // new request at the corrected cost: 20% of 61,000.00 / 12 = 1,016.67 a month (rounded) × 7 = 7,116.69 → book value 53,883.31
      const r2 = (await requestAssetDisposal({ data: disposalInput(s) })) as { requestId: string; plan: { bookValue: number } };
      expect(r2.plan.bookValue).toBe(53883.31);
      net.uid = F;
      expect(await decideAssetDisposal({ data: { requestId: r2.requestId, approve: true, reason: "Checked the invoice" } })).toMatchObject({ ok: true, status: "approved" });
      net.uid = O;
      expect(await assetNow(db, O, s.asset.id)).toMatchObject({ soldOn: "2026-10-31", disposal: { approvedBy: F, requestedBy: O } });
    },
    T,
  );
});

describe("P0-015 on active books: the approved disposal posts a balanced batch — P1..P9 + P14", () => {
  it(
    "D4. step-up required for approval; after approval P7 posts Dr Loss on asset disposal 53,000.00 / Cr Fixed assets 53,000.00; an unapproved disposal entry never posts",
    async () => {
      const db = await fullSchemaDb([...STACK, P9, P14]);
      await seedUsers(db);
      reset(db);
      const s = await seedAsset(db);
      await activateBooks(db, s.assetAcc); // replaces the preferences: put the asset back into the register
      await sql1(db, "UPDATE public.finance_preferences SET data = jsonb_set(data, '{assets}', $2::jsonb) WHERE owner_id = $1", [O, JSON.stringify([s.asset])]);
      const req = (await requestAssetDisposal({ data: disposalInput(s, { proceedsEntryId: null }) })) as { ok: boolean; requestId: string; entryId: string };
      expect(req).toMatchObject({ ok: true });
      await sql1(db, "DELETE FROM public.step_up_grants WHERE owner_id = $1", [O]); // operator: the activation step-ups have lapsed
      expect(await decideAssetDisposal({ data: { requestId: req.requestId, approve: true, reason: "Approved: invoice checked" } })).toMatchObject({ ok: false, error: expect.stringMatching(/Confirm it's you/) });
      await exclusive(async () => { await actAs(db, null); await db.exec("SET ROLE service_role"); await db.query("SELECT public.record_step_up($1,'password',300)", [O]); await actAs(db, null); });
      expect(await decideAssetDisposal({ data: { requestId: req.requestId, approve: true, reason: "Approved: invoice checked" } })).toMatchObject({ ok: true, status: "approved" });
      const lines = await sql1<{ code: string; debit: number; credit: number }>(db,
        "SELECT l.code, l.debit::float8 AS debit, l.credit::float8 AS credit FROM public.posting_lines l JOIN public.posting_batches b ON b.id = l.batch_id JOIN public.posting_events ev ON ev.id = b.event_id WHERE ev.event_key = $1 ORDER BY l.debit DESC", [`ledger_entry:${req.entryId}`]);
      expect(lines).toEqual([
        { code: "expense:Loss on asset disposal (book value)", debit: 53000, credit: 0 },
        { code: `account:${s.assetAcc}`, debit: 0, credit: 53000 },
      ]);
      // A disposal-tagged entry written without an approved request (operator path; clients are refused by P14) never posts.
      const stray = crypto.randomUUID();
      await sql1(db, "INSERT INTO public.expenses(id,employee_id,title,category,amount,original_amount,currency,expense_date,account_id,description,txn_type,adjustment_sign,tags) VALUES ($1,$2,'Disposal · Desk','Asset disposal',900,900,'INR','2026-10-31',$3,'','adjustment',-1,ARRAY['disposal'])", [stray, O, s.assetAcc]);
      expect((await sql1<{ n: number }>(db, "SELECT count(*)::int n FROM public.posting_batches b JOIN public.posting_events ev ON ev.id = b.event_id WHERE ev.event_key = $1", [`ledger_entry:${stray}`]))[0]!.n).toBe(0);
      expect(await sql1(db, "SELECT batch_id FROM public.posting_lines GROUP BY batch_id, currency HAVING sum(debit) <> sum(credit)")).toEqual([]);
      await db.close();
    },
    T,
  );
});

// ---------------------------------------------------------------------------------------------------------------------------
// P0-006 / RB-P1-02 (KK 9 Nov): sensitive exports authorised server-side with workspace / company isolation, step-up where the
// pattern requires it, and an append-only export audit. The REAL server functions (exports.functions.ts → exports.ts) and
// PostgREST-shaped requests as each signed-in user: owner O, other user V, company member M (company c1 only), Finance F
// (company-tax switch), a family member G granted view without export (P2).
const P15 = ".lovable/staged-sql/proposed/P15_export_authorisation.sql";
const G = id(6);
const fileReq = async (kind: ExportKind, text: string, extra: Partial<ExportRequest> = {}) => {
  const bytes = new TextEncoder().encode(text);
  return { kind, fileName: `${kind}.csv`, rows: Math.max(0, text.split("\n").length - 1), bytes: bytes.length, sha256: await sha256Hex(bytes), ...extra };
};
const audit = (db: Db) => sql1<{ actor_id: string; owner_id: string | null; entity_id: string | null; kind: string; row_count: number; byte_count: number; sha256: string; step_up: boolean }>(db, "SELECT actor_id, owner_id, entity_id, kind, row_count, byte_count::int AS byte_count, sha256, step_up FROM public.export_audit ORDER BY created_at");
async function seedExportPeople(db: Db) {
  await seedUsers(db);
  await addUsers(db, { [M]: "m@x.in", [F]: "f@x.in", [G]: "g@x.in" });
  await sql1(db, "INSERT INTO public.user_roles(user_id, role) VALUES ($1,'manager'),($2,'finance')", [M, F]);
  await sql1(db, "UPDATE public.role_permissions SET allowed = true WHERE role = 'finance' AND action IN ('view_expenses','view_company_tax')");
  await sql1(db, "INSERT INTO public.entity_members(owner_id, entity_id, member_id, member_email, can_write) VALUES ($1,'c1',$2,'m@x.in',false)", [O, M]);
}
for (const mode of [{ name: "applied schema WITHOUT P15 (server rule, not audited)", extra: [P9], p15: false }, { name: "P9 + P15 (database decides and audits)", extra: [P9, P15], p15: true }] as const) {
  describe(`P0-006 export authorisation — ${mode.name}`, () => {
    let db: Db;
    beforeAll(async () => {
      db = await fullSchemaDb([...mode.extra]);
      await seedExportPeople(db);
    }, T);

    it(
      "X1. own exports pass and (with P15) are audited with rows, bytes and SHA-256; another person's records under an 'own' kind are refused",
      async () => {
        reset(db);
        const csv = "Date,Amount\n2026-11-01,450.00\n2026-11-02,1234.50";
        const r = await authoriseExport({ data: await fileReq("report", csv) });
        expect(r).toMatchObject({ ok: true, audited: mode.p15 });
        net.uid = V;
        expect(await authoriseExport({ data: await fileReq("report", csv, { ownerId: O }) })).toMatchObject({ ok: false, error: expect.stringMatching(/your own records only/) });
        net.uid = O;
        if (mode.p15) {
          const bytes = new TextEncoder().encode(csv);
          expect(await audit(db)).toEqual([{ actor_id: O, owner_id: O, entity_id: null, kind: "report", row_count: 2, byte_count: bytes.length, sha256: await sha256Hex(bytes), step_up: false }]);
          // append-only: no client update / delete path, TRUNCATE refused
          expect((await api().from("export_audit").update({ kind: "personal" }).eq("actor_id", O).select("id")).data ?? []).toEqual([]);
          expect((await api().from("export_audit").delete().eq("actor_id", O).select("id")).data ?? []).toEqual([]);
          expect(await probe(db, O, "TRUNCATE public.export_audit")).toMatch(/P15_AUDIT_KEPT|permission denied/);
          net.uid = V;
          expect((await api().from("export_audit").select("id")).data).toEqual([]); // another user sees nothing
          net.uid = O;
        }
      },
      T,
    );

    it(
      "X2. shared company: a member exports the company they are granted (c1); another company (c2), another owner's personal records and a non-member are refused",
      async () => {
        reset(db);
        net.uid = M;
        const ok = await authoriseExport({ data: await fileReq("shared_company", "a,b\n1,2", { ownerId: O, entityId: "c1" }) });
        expect(ok).toMatchObject({ ok: true, audited: mode.p15 });
        expect(await authoriseExport({ data: await fileReq("shared_company", "a,b\n1,2", { ownerId: O, entityId: "c2" }) })).toMatchObject({ ok: false, error: expect.stringMatching(/not granted export/) });
        expect(await authoriseExport({ data: await fileReq("shared_company", "a,b\n1,2", { ownerId: O, entityId: null }) })).toMatchObject({ ok: false });
        expect(await authoriseExport({ data: await fileReq("ledger_csv", "a,b\n1,2", { ownerId: O }) })).toMatchObject({ ok: false, error: expect.stringMatching(/your own records only/) });
        net.uid = V;
        expect(await authoriseExport({ data: await fileReq("shared_company", "a,b\n1,2", { ownerId: O, entityId: "c1" }) })).toMatchObject({ ok: false, error: expect.stringMatching(/not granted export/) });
        net.uid = O;
        if (mode.p15) expect((await audit(db)).filter((a) => a.kind === "shared_company").map((a) => [a.actor_id, a.owner_id, a.entity_id])).toEqual([[M, O, "c1"]]);
      },
      T,
    );

    it(
      "X3. Finance company-tax list: Finance with the switch passes; a manager without it is refused; the backup records are read and audited server-side for the caller only",
      async () => {
        reset(db);
        net.uid = F;
        expect(await authoriseExport({ data: await fileReq("team_company_tax", "Company,FY\nAlpha,2026-27") })).toMatchObject({ ok: true });
        net.uid = M;
        expect(await authoriseExport({ data: await fileReq("team_company_tax", "Company,FY\nAlpha,2026-27") })).toMatchObject({ ok: false, error: expect.stringMatching(/exported by Finance/) });
        // Backup: O's records only (V's rows never included), hash and row count audited
        net.uid = O;
        await seedWithdrawFixture(db);
        net.uid = V;
        const vAcc = await freshAccount(db, V);
        await sql1(db, "INSERT INTO public.expenses(id,employee_id,title,category,amount,original_amount,currency,expense_date,account_id,description) VALUES (gen_random_uuid(),$1,'Rent','Housing',15000,15000,'INR','2026-11-01',$2,'')", [V, vAcc]);
        net.uid = O;
        const b = await exportBackupData({ data: { fileName: "ledgerline-backup.zip" } });
        expect(b).toMatchObject({ ok: true, audited: mode.p15 });
        const data = JSON.parse((b as { json: string }).json) as Backup["data"];
        expect((data.expenses ?? []).every((e) => e["employee_id"] === O)).toBe(true);
        expect((data.accounts ?? []).every((a) => a["owner_id"] === O)).toBe(true);
        expect((b as { sha256: string }).sha256).toBe(await sha256Hex(new TextEncoder().encode((b as { json: string }).json)));
        if (mode.p15) {
          const row = (await audit(db)).find((a) => a.kind === "backup")!;
          expect(row).toMatchObject({ actor_id: O, owner_id: O, row_count: Object.values(data).reduce((s, x) => s + (x?.length ?? 0), 0), sha256: (b as { sha256: string }).sha256 });
        }
      },
      T,
    );
  });
}

describe("P0-006 on the whole proposed stack (P2 'export' permission, P4 step-up) — P1..P14 + P15", () => {
  it(
    "X4. sensitive export without step-up refused, with step-up audited (step_up true); P2: a viewer without 'export' is refused, a granted company member passes, cross-company refused",
    async () => {
      const db = await fullSchemaDb([...STACK, P9, P10, P11, P13, P14, P15]);
      await seedExportPeople(db);
      reset(db);
      expect(await authoriseExport({ data: await fileReq("backup", "x\n1") })).toMatchObject({ ok: false, error: expect.stringMatching(/^STEP_UP_REQUIRED/) });
      expect(await authoriseExport({ data: await fileReq("report", "x\n1") })).toMatchObject({ ok: true }); // not sensitive
      await exclusive(async () => { await actAs(db, null); await db.exec("SET ROLE service_role"); await db.query("SELECT public.record_step_up($1,'password',300)", [O]); await actAs(db, null); });
      expect(await authoriseExport({ data: await fileReq("tax_filing", "x\n1") })).toMatchObject({ ok: true, audited: true });
      expect((await audit(db)).map((a) => [a.kind, a.step_up])).toEqual([["report", false], ["tax_filing", true]]);
      // P2 grants: G is an adult family member of O (view, no export) for c1; M's entity_members grant was synced as legacy viewer (view, export)
      await sql1(db, "INSERT INTO public.access_grants(workspace_owner_id, entity_id, role, grantee_email, grantee_id, granted_by, accepted_at, identity_check) VALUES ($1,'c1','adult_family_member','g@x.in',$2,$1,now(),'confirmed_email_match')", [O, G]);
      net.uid = G;
      expect(await authoriseExport({ data: await fileReq("shared_company", "a\n1", { ownerId: O, entityId: "c1" }) })).toMatchObject({ ok: false, error: expect.stringMatching(/not granted export/) });
      net.uid = M;
      expect(await authoriseExport({ data: await fileReq("shared_company", "a\n1", { ownerId: O, entityId: "c1" }) })).toMatchObject({ ok: true, audited: true });
      expect(await authoriseExport({ data: await fileReq("shared_company", "a\n1", { ownerId: O, entityId: "c2" }) })).toMatchObject({ ok: false, error: expect.stringMatching(/not granted export/) });
      await db.close();
    },
    T,
  );
});

// ---------------------------------------------------------------------------------------------------------------------------
// P0-034 (KK, approved): Statement Desk Undo withdraws (recoverable) the unposted, unreconciled entries an upload created;
// posted entries get the authorised linked reversal (P7); entries reconciled since go through correction; entries the upload
// merely matched only lose that match. Every case drives the REAL Statement Desk code: buildPlan → applyUpload (store save with
// the stable line id, reconcile, upload-time Undo snapshots, upload history checkpoint) and Undo through undoUpload → the REAL
// undoStatement server function (atomic-undo.functions.ts) → reverse_statement_upload (P7 body + P16) as the signed-in owner,
// over PostgREST-shaped requests against isolated PGlite, with faults injected at the request boundary.
const P16 = ".lovable/staged-sql/proposed/P16_statement_undo_withdraw.sql";
const DESK_CATS = [{ name: "Food and beverages", archived: false }, { name: "Shopping", archived: false }, { name: "Utilities", archived: false }, { name: "Other", archived: false }];
const DESK_ACCOUNT = (acc: string): Account => ({ id: acc, name: "HDFC Savings", kind: "savings", openingBalance: 10000, archived: false });
/** November statement, no running balance. L2/L3 are two identical, legitimate same-day purchases. L4 is the electricity bill
 *  already entered by hand (matched, never created). Created by the upload: 450.00 + 2,999.00 + 2,999.00 + 649.00 = 7,097.00. */
const DESK_LINES = [
  { ref: "1", date: "2026-11-01", description: "UPI/SWIGGY/412345678901", amount: 450, direction: "debit" as const },
  { ref: "2", date: "2026-11-03", description: "POS AMAZON RETAIL", amount: 2999, direction: "debit" as const },
  { ref: "3", date: "2026-11-03", description: "POS AMAZON RETAIL", amount: 2999, direction: "debit" as const },
  { ref: "4", date: "2026-11-04", description: "BESCOM ELECTRICITY", amount: 1200, direction: "debit" as const },
  { ref: "5", date: "2026-11-05", description: "NETFLIX SUBSCRIPTION 412345678905", amount: 649, direction: "debit" as const },
];
const deskStepUp = (db: Db) => exclusive(async () => { await actAs(db, null); await db.exec("SET ROLE service_role"); await db.query("SELECT public.record_step_up($1,'password',300)", [O]); await actAs(db, null); });
/** store.transactions as Statement Desk sees it: the owner's rows through ledgerView (withdrawn entries left out). */
async function deskTransactions(): Promise<{ live: Expense[]; withdrawn: Set<string> }> {
  const r = await supabase.from("expenses").select("*").eq("employee_id", net.uid);
  if (r.error) throw new Error(r.error.message);
  const all = ((r.data ?? []) as Row[]).map((x) => ({
    ...txnFromRow(x as unknown as LedgerRow), title: x["title"], merchant: x["merchant"], category: x["category"], currency: x["currency"], fxRate: Number(x["fx_rate"]),
    statementRef: x["statement_ref"] ?? null, reconciledAt: x["reconciled_at"] ?? null, correctionRevision: Number(x["correction_revision"]), receipts: x["receipts"] ?? [],
    tags: x["tags"] ?? [], splits: x["splits"] ?? [], allocations: x["allocations"] ?? [], description: x["description"] ?? "", paymentMethod: x["payment_method"], scope: x["scope"],
  })) as unknown as Expense[];
  return { live: ledgerView(all as unknown as Txn[]) as unknown as Expense[], withdrawn: new Set(all.filter((x) => x.withdrawnAt).map((x) => x.id)) };
}
/** One Statement Desk upload + Save, wired as statements.tsx apply() wires it. Returns the upload id and the ApplyResult. */
async function deskUpload(db: Db, acc: string, fileName: string, lines: typeof DESK_LINES, opts: { stopOnError?: boolean } = {}) {
  const { live, withdrawn } = await deskTransactions();
  const file: StmtFile = { name: fileName, accountId: acc, hint: null, currency: "INR", opening: null, closing: null, lines: fromStatementLines(fileName, lines) };
  const plan = buildPlan([file], [DESK_ACCOUNT(acc)], live, DESK_CATS).accounts[0]!;
  const decisions = [...plan.auto, ...plan.ask];
  const approvals = Object.fromEntries(decisions.map((d) => [d.line.key, "2026-11-10T09:00:00.000Z"]));
  const request = { account: plan, decisions, reviewed: approvals, destination: null, draftLinks: {},
    reconcileIds: plan.matched.filter((m) => m.record && !m.record.reconciledAt).map((m) => ({ id: m.record!.id, ref: `${m.line.file} · ${m.line.date} · ${m.line.amount.toFixed(2)}` })) };
  const uploadId = crypto.randomUUID(), at = "2026-11-10T09:00:00.000Z";
  const expected = { posted: decisions.length, reconciled: request.reconcileIds.length, drafts: 0 };
  const checkpoint = async (r: ApplyResult, status: "interrupted" | "complete" = "interrupted") => {
    const prefs = await prefsOf(O);
    const uploads = ((prefs as { statementUploads?: { id: string }[] }).statementUploads ?? []).filter((u) => u.id !== uploadId);
    const w = await writePrefs(O, { ...prefs, statementUploads: [...uploads, { ...structuredClone(r), id: uploadId, at, label: fileName, status, expected }] });
    if (w.error) throw new Error(w.error.message);
  };
  // The original statement is kept as a private document before the first financial write (prepareSource).
  const docId = crypto.randomUUID(), path = `${O}/statements/${docId}-${fileName}`;
  const api: ApplyApi = {
    transactions: live, withdrawnIds: withdrawn, addAccount: async () => { throw new Error("no new account"); }, setArchived: async () => {},
    save: async (input, o) => storeSave(input, { createId: o!.createId! }),
    reconcile: async (rowId, ref) => { const r = await supabase.from("expenses").update({ statement_ref: ref, reconciled_at: ref ? new Date().toISOString() : null }).eq("id", rowId); if (r.error) throw new Error(r.error.message); },
    remove: async () => { throw new Error("Statement Desk never removes rows outside the atomic Undo"); },
    refresh: async () => {},
    readUndoRow: async (rowId) => { const r = await supabase.from("expenses").select("id,statement_ref,correction_revision").eq("employee_id", O).eq("id", rowId).maybeSingle(); const d = r.data as Row | null; if (r.error || !d) throw new Error("snapshot unavailable"); return { id: String(d["id"]), ref: (d["statement_ref"] as string | null) ?? null, revision: Number(d["correction_revision"]) }; },
    readEvidence: async (rowId) => { const r = await supabase.from("expenses").select("statement_ref,reconciled_at").eq("employee_id", O).eq("id", rowId).maybeSingle(); const d = r.data as Row | null; return d ? { statementRef: (d["statement_ref"] as string | null) ?? null, reconciledAt: (d["reconciled_at"] as string | null) ?? null } : null; },
    prepareSource: async () => {
      await sql1(db, "INSERT INTO storage.objects(bucket_id, name, owner_id, metadata) VALUES ('documents', $1, $2, '{\"size\": 4096}') ON CONFLICT DO NOTHING", [path, O]);
      await sql1(db, "INSERT INTO public.documents(id, owner_id, title, file_path, file_name, size_bytes, notes, evidence_locked) VALUES ($1,$2,$3,$4,$5,4096,'Statement Desk source',true)", [docId, O, `Statement · ${fileName}`, path, fileName]);
      return docId;
    },
    checkpoint,
  };
  await checkpoint({ posted: [], reconciled: [], createdAccounts: [] });
  let result: ApplyResult;
  try { result = await applyUpload([request], api); await checkpoint(result, "complete"); }
  catch (e) { if (!(e instanceof PartialUploadError) || opts.stopOnError) throw e; result = e.result; await checkpoint(result); }
  return { uploadId, result, docId, path, decisions: decisions.length, matched: request.reconcileIds.map((m) => m.id) };
}
/** Statement Desk Undo exactly as statements.tsx undo() runs it: undoUpload preflight → atomicUndo → the undoStatement server function. */
async function deskUndo(db: Db, uploadId: string) {
  const prefs = await prefsOf(O);
  const upload = ((prefs as { statementUploads?: (ApplyResult & { id: string; undoRows?: { id: string; ref: string | null; revision: number }[] })[] }).statementUploads ?? []).find((u) => u.id === uploadId)!;
  const { live } = await deskTransactions();
  let report: unknown = null;
  await deskStepUp(db);
  const { left } = await undoUpload(upload, {
    transactions: live, save: async () => {}, reconcile: async () => {}, remove: async () => {}, addAccount: async () => "", setArchived: async () => {}, refresh: async () => {},
    readExistingIds: async (ids) => ((await supabase.from("expenses").select("id").eq("employee_id", O).in("id", ids)).data as Row[]).map((r) => String(r["id"])),
    atomicUndo: async (r) => { report = (await undoStatement({ data: { id: uploadId, posted: r.posted, reconciled: r.reconciled, evidence: r.evidence ?? [], expected: upload.undoRows ?? [] } })).report; },
  });
  return { left, report: report as { reversed: { entryId: string }[]; withdrawn: string[]; deleted: string[]; unreconciled: string[]; replayed: boolean } | null };
}
const entryRow = async (db: Db, entry: string) => (await sql1<{ j: Row }>(db, "SELECT to_jsonb(e) j FROM public.expenses e WHERE id = $1", [entry]))[0]?.j;
const withdrawalOf = (row: Row | undefined) => ((row?.["receipt_details"] as Row | null)?.["withdrawal"] ?? null) as null | { state: string; by: string; at: string; reason: string; history: { action: string; by: string; reason: string; source?: Row }[] };
async function deskFixture(db: Db) {
  const acc = id(++accSeq);
  await sql1(db, "INSERT INTO public.accounts(id, owner_id, name, kind, opening_balance) VALUES ($1, $2, 'HDFC Savings', 'savings', 10000)", [acc, O]);
  const bill = crypto.randomUUID();
  await sql1(db, "INSERT INTO public.expenses(id,employee_id,title,merchant,category,amount,original_amount,currency,expense_date,account_id,description) VALUES ($1,$2,'Electricity','BESCOM','Utilities',1200,1200,'INR','2026-11-04',$3,'Typed in by hand')", [bill, O, acc]);
  return { acc, bill };
}
/** Per-account figures (owner-wide spending also includes the other cases' accounts). */
// (The assistant reads accounts by name and every case adds an "HDFC Savings"; U1 checks it on the only one.)
const acct = (x: Awaited<ReturnType<typeof figures>>) => ({ balance: x.balance, netWorth: x.netWorth, report: x.report });
const acctAt = (n: number) => ({ balance: n, netWorth: n, report: n });
const undoCapability = () => (statementUndoCapability as unknown as (x: { data?: unknown }) => Promise<{ state: string }>)({});
/** The same Undo request again from a second device / double tap: straight to the server function with the saved manifest. */
async function deskUndoAgain(db: Db, uploadId: string) {
  const prefs = await prefsOf(O);
  const u = ((prefs as { statementUploads?: (ApplyResult & { id: string; undoRows?: { id: string; ref: string | null; revision: number }[] })[] }).statementUploads ?? []).find((x) => x.id === uploadId)!;
  await deskStepUp(db);
  return (await undoStatement({ data: { id: uploadId, posted: u.posted, reconciled: u.reconciled, evidence: u.evidence ?? [], expected: u.undoRows ?? [] } })) as { report: unknown };
}

describe("P0-034 Statement Desk Undo withdraws what the upload created — P1..P9 + P10 + P16", () => {
  let db: Db;
  beforeAll(async () => {
    db = await fullSchemaDb([...STACK, P9, P10, P16]);
    await seedUsers(db);
  }, T);

  it(
    "U1. Undo: created unposted rows withdrawn with reason/actor/time/source (rows, receipts, statement ref and original kept); the matched bill only loses its match; figures back; repeat Undo replays",
    async () => {
      // Hand-calculated: opening 10,000.00 − bill 1,200.00 = 8,800.00 before; the upload creates 450.00 + 2,999.00 + 2,999.00 + 649.00
      // = 7,097.00 → 1,703.00 and spent 8,297.00; after Undo 8,800.00 / spent 1,200.00 / one live entry in every reader.
      reset(db);
      const f = await deskFixture(db);
      expect(await figures(f.acc)).toMatchObject({ balance: 8800, spent: 1200, netWorth: 8800, report: 8800, assistant: 8800, count: 1 });
      const up = await deskUpload(db, f.acc, "hdfc-nov.csv", DESK_LINES);
      expect(up.decisions).toBe(4);
      expect(up.matched).toEqual([f.bill]);
      expect(new Set(up.result.posted).size).toBe(4); // the two identical purchases are two entries
      expect(await figures(f.acc)).toMatchObject({ balance: 1703, spent: 8297, netWorth: 1703, report: 1703, assistant: 1703, count: 5 });
      const before = Object.fromEntries(await Promise.all(up.result.posted.map(async (x) => [x, await entryRow(db, x)] as const)));
      net.log = [];
      const { left, report } = await deskUndo(db, up.uploadId);
      expect(left).toEqual([]);
      expect(report).toMatchObject({ reversed: [], deleted: [], unreconciled: [f.bill], replayed: false });
      expect([...report!.withdrawn].sort()).toEqual([...up.result.posted].sort());
      expect(net.log.filter((x) => /delete:|remove:/.test(x))).toEqual([]); // no DELETE request, no file removed
      for (const x of up.result.posted) {
        const row = await entryRow(db, x);
        const w = withdrawalOf(row)!;
        expect(w).toMatchObject({ state: "withdrawn", by: O, reason: 'Statement upload undone: Statement Desk Undo of "hdfc-nov.csv"' });
        expect(w.history).toHaveLength(1);
        expect(w.history[0]!.source).toMatchObject({ kind: "statement_undo", upload: up.uploadId, request: up.uploadId, statementRef: before[x]!["statement_ref"] });
        // Everything but the withdrawal (and the revision it bumps) is byte-identical: amount, date, account, statement ref, receipts.
        const strip = (r: Row) => { const { receipt_details: rd, correction_revision: _c, updated_at: _u, ...rest } = r; return { ...rest, rd: { ...(rd as Row), withdrawal: undefined } }; };
        expect(strip(row!)).toEqual(strip(before[x]!));
        expect(String(row!["statement_ref"])).toMatch(new RegExp(`^document:${up.docId} · `));
      }
      // The matched bill is not withdrawn: only this upload's match is cleared.
      const bill = await entryRow(db, f.bill);
      expect(withdrawalOf(bill)).toBeNull();
      expect([bill!["statement_ref"], bill!["reconciled_at"], bill!["amount"]]).toEqual([null, null, 1200]);
      // The original statement and its stored file are kept.
      expect(await present(db, "documents", up.docId)).toBe(1);
      expect((await sql1<{ n: number }>(db, "SELECT count(*)::int n FROM storage.objects WHERE name = $1", [up.path]))[0]!.n).toBe(1);
      expect(await figures(f.acc)).toMatchObject({ balance: 8800, spent: 1200, netWorth: 8800, report: 8800, assistant: 8800, count: 1 });
      // Audit receipt: reason, actor and time of the whole Undo.
      const receipt = (await sql1<{ reason: string; actor_id: string; created_at: string; result: Row }>(db, "SELECT reason, actor_id, created_at::text, result FROM public.statement_upload_reversals WHERE id = $1", [up.uploadId]))[0]!;
      expect(receipt).toMatchObject({ reason: 'Statement Desk Undo of "hdfc-nov.csv"', actor_id: O });
      // Repeat Undo (double tap, a second device still showing the upload): the server answers from the receipt, changes nothing.
      const again = (await deskUndoAgain(db, up.uploadId)).report as { withdrawn: string[] };
      expect([...again.withdrawn].sort()).toEqual([...report!.withdrawn].sort());
      expect((await sql1<{ n: number }>(db, "SELECT count(*)::int n FROM public.statement_upload_reversals WHERE upload_id = $1", [up.uploadId]))[0]!.n).toBe(1);
      for (const x of up.result.posted) expect(withdrawalOf(await entryRow(db, x))!.history).toHaveLength(1);
      expect(acct(await figures(f.acc))).toEqual(acctAt(8800));
    },
    T,
  );

  it(
    "U2. interrupted import, failed and lost Undo responses, then a re-import: only confirmed rows withdrawn once; the same lines are neither duplicated nor reactivated",
    async () => {
      reset(db);
      const f = await deskFixture(db);
      // Injected: the 3rd save never reaches the server → the upload stops with 2 confirmed rows (450.00, 2,999.00).
      // (The bill line is left out: a matched record whose match step never ran keeps a partial upload under review.)
      const lines = DESK_LINES.filter((l) => l.ref !== "4");
      hook({ op: "server:saveExpense", kind: "fail", nth: 3 });
      const up = await deskUpload(db, f.acc, "hdfc-nov.csv", lines);
      net.hooks = [];
      expect(up.result.posted).toHaveLength(2);
      // Injected: the Undo transaction never reaches the database → nothing changed, recovery kept.
      hook({ op: "rpc:reverse_statement_upload", kind: "fail" });
      await expect(deskUndo(db, up.uploadId)).rejects.toThrow();
      for (const x of up.result.posted) expect(withdrawalOf(await entryRow(db, x))).toBeNull();
      // Injected: the Undo commits and the response is lost → the durable receipt confirms it; no second withdrawal.
      net.hooks = [];
      hook({ op: "rpc:reverse_statement_upload", kind: "lose" });
      const lost = await deskUndo(db, up.uploadId);
      net.hooks = [];
      expect(lost.left).toEqual([]);
      for (const x of up.result.posted) expect(withdrawalOf(await entryRow(db, x))).toMatchObject({ state: "withdrawn" });
      expect((await sql1<{ n: number }>(db, "SELECT count(*)::int n FROM public.statement_upload_reversals WHERE id = $1", [up.uploadId]))[0]!.n).toBe(1);
      expect(acct(await figures(f.acc))).toEqual(acctAt(8800));
      // Re-import of the same file: the 2 withdrawn lines are reported, not saved again; the 2 never-created lines are added once.
      const re = await deskUpload(db, f.acc, "hdfc-nov.csv", lines);
      expect(re.result.withdrawnLines?.map((x) => x.id).sort()).toEqual([...up.result.posted].sort());
      expect(re.result.posted).toHaveLength(2);
      expect(re.result.posted.some((x) => up.result.posted.includes(x))).toBe(false);
      for (const x of up.result.posted) expect(withdrawalOf(await entryRow(db, x))!.state).toBe("withdrawn");
      expect((await sql1<{ n: number }>(db, "SELECT count(*)::int n FROM public.expenses WHERE account_id = $1", [f.acc]))[0]!.n).toBe(1 + 2 + 2);
      // 8,800.00 − 2,999.00 − 649.00 = 5,152.00 (the 2nd Amazon purchase and Netflix; Swiggy and the 1st Amazon stay withdrawn)
      expect(acct(await figures(f.acc))).toEqual(acctAt(5152));
      // Direct API: saving a withdrawn line's stable id again is refused (server), never a silent reactivation.
      const { live } = await deskTransactions();
      void live;
      const direct = await saveExpense({ data: { id: null, createId: up.result.posted[0]!, title: "Swiggy", merchant: null, category: "Food and beverages", scope: "personal", memberId: null, splits: [], currency: "INR", originalAmount: 450, date: "2026-11-01", description: "", paymentMethod: "upi", txnType: "expense", accountId: f.acc, toAccountId: null, tags: [], receiptDetails: {} } });
      expect(direct).toEqual({ ok: false, error: expect.stringMatching(/withdrawn \(kept in history\)\. Restore it/) });
    },
    T,
  );

  it(
    "U3. reordered statement and a different file with the same name: identities come from the lines, never the file; each Undo touches only its own upload",
    async () => {
      reset(db);
      const f = await deskFixture(db);
      const a = await deskUpload(db, f.acc, "statement.csv", DESK_LINES);
      expect((await deskUndo(db, a.uploadId)).left).toEqual([]);
      // The same lines in reverse order (bank re-download): every line meets its withdrawn entry; nothing added.
      const reordered = await deskUpload(db, f.acc, "statement.csv", [...DESK_LINES].reverse().map((l, i) => ({ ...l, ref: `r${i}` })));
      expect(reordered.result.posted).toEqual([]);
      expect(reordered.result.withdrawnLines?.map((x) => x.id).sort()).toEqual([...a.result.posted].sort());
      // A different statement saved under the same file name: new lines, new entries.
      const other = await deskUpload(db, f.acc, "statement.csv", [
        { ref: "x1", date: "2026-11-07", description: "UPI/ZOMATO/412345678907", amount: 380, direction: "debit" },
        { ref: "x2", date: "2026-11-08", description: "UPI/UBER/412345678908", amount: 212.5, direction: "debit" },
      ]);
      expect(other.result.posted).toHaveLength(2);
      expect(acct(await figures(f.acc))).toEqual(acctAt(8207.5)); // 8,800.00 − 380.00 − 212.50
      const u = await deskUndo(db, other.uploadId);
      expect([...u.report!.withdrawn].sort()).toEqual([...other.result.posted].sort());
      for (const x of a.result.posted) expect(withdrawalOf(await entryRow(db, x))!.history).toHaveLength(1); // first upload untouched
      expect(withdrawalOf(await entryRow(db, f.bill))).toBeNull();
      expect(acct(await figures(f.acc))).toEqual(acctAt(8800));
    },
    T,
  );

  it(
    "U4. controlled paths: a created row matched to other statement evidence since → correction (refused, nothing changed); a closed period → refused; the app refuses Undo without P16",
    async () => {
      reset(db);
      const f = await deskFixture(db);
      const up = await deskUpload(db, f.acc, "hdfc-nov.csv", DESK_LINES);
      const target = up.result.posted[0]!;
      const snapshot = async () => Object.fromEntries(await Promise.all([...up.result.posted, f.bill].map(async (x) => [x, JSON.stringify(await entryRow(db, x))] as const)));
      // A later statement reconciles one created row against its own line (different evidence).
      expect((await api().from("expenses").update({ statement_ref: "document:later · L0001 · 2026-11-01 · 450.00", reconciled_at: new Date().toISOString() }).eq("id", target).select("id")).error).toBeNull();
      // The app preflight already keeps it for review; the database refuses the same manifest on its own.
      const s0 = await snapshot();
      expect((await deskUndo(db, up.uploadId)).left).toEqual([target]);
      const prefs = await prefsOf(O);
      const upload = (prefs as { statementUploads: (ApplyResult & { id: string; undoRows: { id: string; ref: string | null; revision: number }[] })[] }).statementUploads.find((u) => u.id === up.uploadId)!;
      const rows = ((await supabase.from("expenses").select("*").in("id", [...upload.posted, ...upload.reconciled])).data ?? []) as Row[];
      const items = rows.map((r) => ({ action: upload.posted.includes(String(r["id"])) ? "remove" : "unreconcile", ref: upload.undoRows.find((u) => u.id === r["id"])!.ref, snapshot: r }));
      await deskStepUp(db);
      expect((await api().rpc("reverse_statement_upload", { _request: up.uploadId, _upload: up.uploadId, _items: items, _reason: "Wrong statement" })).error?.message).toMatch(/^P16_RECONCILED: .*correction workflow/);
      expect(await snapshot()).toEqual(s0);
      // A row the upload created in a period closed since: the Undo is refused before any write (correction path).
      const oct = await deskUpload(db, f.acc, "hdfc-oct.csv", [
        { ref: "o1", date: "2026-10-20", description: "UPI/IRCTC/412345678920", amount: 1500, direction: "debit" },
        { ref: "o2", date: "2026-10-21", description: "UPI/OLA/412345678921", amount: 310, direction: "debit" },
      ]);
      const octRows = async () => Object.fromEntries(await Promise.all(oct.result.posted.map(async (x) => [x, JSON.stringify(await entryRow(db, x))] as const)));
      const setClosed = async (periods: unknown[]) => {
        await sql1(db, "ALTER TABLE public.finance_preferences DISABLE TRIGGER USER");
        try { await sql1(db, "UPDATE public.finance_preferences SET data = jsonb_set(data, '{books}', coalesce(data->'books','{}') || jsonb_build_object('closedPeriods', $2::jsonb)) WHERE owner_id = $1", [O, JSON.stringify(periods)]); }
        finally { await sql1(db, "ALTER TABLE public.finance_preferences ENABLE TRIGGER USER"); }
      };
      const s1 = await octRows();
      await setClosed([{ from: "2026-10-01", to: "2026-10-31" }]);
      try { await expect(deskUndo(db, oct.uploadId)).rejects.toThrow(/^P16_CLOSED_PERIOD: .*correction workflow/); }
      finally { await setClosed([]); }
      expect(await octRows()).toEqual(s1);
      // Without P16 (probe missing) the app refuses before any write: no DELETE path, no sequential fallback.
      await sql1(db, "ALTER FUNCTION public.statement_undo_withdraws() RENAME TO statement_undo_withdraws_off");
      try {
        expect(await undoCapability()).toEqual({ state: "needs-update" });
        await expect(deskUndo(db, oct.uploadId)).rejects.toThrow(UNDO_NEEDS_UPDATE);
        expect(await octRows()).toEqual(s1);
      } finally { await sql1(db, "ALTER FUNCTION public.statement_undo_withdraws_off() RENAME TO statement_undo_withdraws"); }
      expect(await undoCapability()).toEqual({ state: "available" });
      expect((await deskUndo(db, oct.uploadId)).left).toEqual([]);
      for (const x of oct.result.posted) expect(withdrawalOf(await entryRow(db, x))!.state).toBe("withdrawn");
    },
    T,
  );

  it(
    "U5. restore only through the authorised operation; an older backup cannot reactivate; a later Undo replay never re-withdraws a restored entry",
    async () => {
      reset(db);
      const f = await deskFixture(db);
      const up = await deskUpload(db, f.acc, "hdfc-nov.csv", DESK_LINES);
      const older = await exportOwner(db, O); // taken after the import, before the Undo
      await deskUndo(db, up.uploadId);
      const swiggy = up.result.posted[0]!;
      // Not by a forged PATCH, not by another user.
      expect((await api().from("expenses").update({ receipt_details: { withdrawal: { state: "restored", at: "2026-11-10", by: O, reason: "forged!", history: [] } } }).eq("id", swiggy).select("id")).error?.message).toMatch(/P10_WITHDRAWAL_ONLY_BY_FUNCTION/);
      net.uid = V;
      expect(await withdrawCall(swiggy, "Someone else's entry", "restore")).toMatchObject({ ok: false, error: expect.stringMatching(/^P10_NOT_FOUND/) });
      net.uid = O;
      // An older backup (from before the Undo) restored with the real restore step: nothing comes back.
      const r = await guardedRestore({ owner: O, data: (await planRestore(older, O, { stageFiles: true })).data }, restoreApi());
      expect(r.status).toBe("restored");
      for (const x of up.result.posted) expect(withdrawalOf(await entryRow(db, x))!.state).toBe("withdrawn");
      expect(acct(await figures(f.acc))).toEqual(acctAt(8800));
      // The owner restores one entry with a reason: it counts again, statement reference intact, history kept.
      expect(await withdrawCall(swiggy, "Swiggy order was real", "restore")).toEqual({ ok: true, replayed: false });
      const w = withdrawalOf(await entryRow(db, swiggy))!;
      expect(w.history.map((h) => h.action)).toEqual(["withdrawn", "restored"]);
      expect(acct(await figures(f.acc))).toEqual(acctAt(8350)); // 8,800.00 − 450.00
      // Repeating the Undo replays the receipt: the restored entry is not withdrawn again.
      expect((await deskUndoAgain(db, up.uploadId)).report).toMatchObject({ withdrawn: expect.arrayContaining([swiggy]) });
      expect(withdrawalOf(await entryRow(db, swiggy))!.state).toBe("restored");
      expect(withdrawalOf(await entryRow(db, swiggy))!.history).toHaveLength(2);
    },
    T,
  );

  it(
    "U6. R-P10-1 / P7: activating balanced books after an Undo never posts the withdrawn rows; on active books a later Undo reverses posted rows (linked reversal), withdraws none",
    async () => {
      reset(db);
      const f = await deskFixture(db);
      const up = await deskUpload(db, f.acc, "hdfc-nov.csv", DESK_LINES);
      await deskUndo(db, up.uploadId);
      await activateBooks(db, f.acc);
      const events = async (x: string) => (await sql1<{ n: number }>(db, "SELECT count(*)::int n FROM public.posting_events WHERE owner_id = $1 AND event_key = $2", [O, `ledger_entry:${x}`]))[0]!.n;
      for (const x of up.result.posted) expect(await events(x)).toBe(0);
      expect(await events(f.bill)).toBe(1);
      expect(await sql1(db, "SELECT batch_id FROM public.posting_lines GROUP BY batch_id, currency HAVING sum(debit) <> sum(credit)")).toEqual([]);
      // A new upload on active books posts its rows; its Undo reverses them (kept + linked reversal), withdraws nothing.
      const next = await deskUpload(db, f.acc, "hdfc-dec.csv", [
        { ref: "d1", date: "2026-11-09", description: "UPI/ZOMATO/412345678909", amount: 380, direction: "debit" },
      ]);
      expect(next.result.posted).toHaveLength(1);
      expect(await events(next.result.posted[0]!)).toBe(1);
      const u = await deskUndo(db, next.uploadId);
      expect(u.report).toMatchObject({ withdrawn: [], deleted: [] });
      expect(u.report!.reversed.map((x) => x.entryId)).toEqual(next.result.posted);
      expect(withdrawalOf(await entryRow(db, next.result.posted[0]!))).toBeNull();
      expect(await sql1(db, "SELECT batch_id FROM public.posting_lines GROUP BY batch_id, currency HAVING sum(debit) <> sum(credit)")).toEqual([]);
      expect(acct(await figures(f.acc))).toEqual(acctAt(8800));
    },
    T,
  );
});
