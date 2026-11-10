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
const cols = (s: string) =>
  s.trim() === "*"
    ? "*"
    : s
        .split(",")
        .map((c) => ident(c.trim()))
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
    this.where.push({ sql: (i) => `${ident(k)} = $${i}`, value: v });
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
        hook({ op: "select:expenses", kind: "fail", nth: 1 });
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
