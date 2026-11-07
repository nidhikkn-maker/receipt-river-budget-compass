import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { accountStatementStatus, type StatementStatusEvidence } from "./account-statement-status";
import { checkpointHash, checkpointSnapshot } from "./statement-checkpoint";
import { normalizePreferences, type FinancePreferences } from "./preferences";
import type { Expense } from "./expenses";
import type { Account } from "./ledger";
import type { ImportBatch, ImportRow } from "./historical-import";
import { identityCandidates, statementReviewBlockers, type StatementReview } from "./statement-evidence";

export const saveStatementEvidence = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((raw: unknown) => z.object({ batch: z.string().uuid(), expected: z.record(z.string(), z.unknown()), review: z.object({ identity: z.object({ bank: z.string().max(100), identifier: z.string().max(40), reference: z.string().max(500), confirmed: z.boolean(), missingIdentifierConfirmed: z.boolean(), accountId: z.string().uuid(), reviewedAt: z.string() }), coverage: z.object({ from: z.string(), to: z.string(), reference: z.string().max(500), confirmed: z.boolean(), reviewedAt: z.string() }).optional(), convention: z.enum(["asset", "liability"]) }) }).parse(raw)).handler(async ({ data, context }) => {
  const batch = await context.supabase.from("import_batches").select("account_id").eq("id", data.batch).eq("owner_id", context.userId).single();
  if (batch.error) throw Error("Statement unavailable");
  const accounts = await context.supabase.from("accounts").select("*").eq("owner_id", context.userId);
  if (accounts.error) throw Error("Accounts unavailable");
  const mapped = accounts.data.map(a => ({ id: a.id, name: a.name, kind: a.kind as Account["kind"], openingBalance: Number(a.opening_balance), archived: a.archived, lastFour: a.last_four, issuer: a.issuer }));
  const account = mapped.find(a => a.id === batch.data.account_id);
  const review: StatementReview = { identity: data.review.identity, convention: data.review.convention, ...(data.review.coverage ? { coverage: data.review.coverage } : {}) };
  const errors = statementReviewBlockers(review, account, [], new Date().toISOString().slice(0, 10));
  if (errors.length) throw Error(errors[0]);
  const candidates = identityCandidates({ bank: data.review.identity.bank, identifier: data.review.identity.identifier || null, quote: data.review.identity.reference, page: null }, mapped);
  if (candidates.length && !candidates.some(a => a.id === batch.data.account_id)) throw Error("The identifier matches a different configured account. Preserve this import and reprocess a copy under the correct account.");
  const result = await context.supabase.rpc("review_statement_evidence", { _batch: data.batch, _expected: data.expected as Json, _review: data.review as Json });
  if (result.error) throw Error(result.error.message);
  return { ok: true };
});

export const copyStatementToAccount = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((raw: unknown) => z.object({ batch: z.string().uuid(), account: z.string().uuid() }).parse(raw)).handler(async ({ data, context }) => {
  const db = context.supabase;
  const batch = await db.from("import_batches").select("*").eq("id", data.batch).eq("owner_id", context.userId).single();
  const account = await db.from("accounts").select("id").eq("id", data.account).eq("owner_id", context.userId).eq("archived", false).single();
  if (batch.error || account.error || batch.data.account_id === data.account) throw Error("Choose a different active account.");
  const existing = await db.from("import_batches").select("id").eq("account_id", data.account).eq("file_hash", batch.data.file_hash).maybeSingle();
  if (existing.error) throw Error("Could not check earlier imports.");
  if (existing.data) return { id: existing.data.id, reused: true };
  const source = await db.storage.from("receipts").download(batch.data.file_path);
  if (source.error || !source.data) throw Error("Original statement unavailable; no copy created.");
  const id = crypto.randomUUID(), path = `${context.userId}/statements/${id}-copy`;
  const uploaded = await db.storage.from("receipts").upload(path, source.data, { contentType: source.data.type || "application/octet-stream" });
  if (uploaded.error) throw Error("Could not preserve the new source copy.");
  const created = await db.from("import_batches").insert({ id, account_id: data.account, file_name: batch.data.file_name, file_hash: batch.data.file_hash, file_path: path, currency: batch.data.currency, allow_ai: batch.data.allow_ai, raw_lines: batch.data.raw_lines, statement_identity: batch.data.statement_identity, source_balances: batch.data.source_balances, period_from: batch.data.period_from, period_to: batch.data.period_to });
  if (created.error) { await db.storage.from("receipts").remove([path]); throw Error("Could not save the copy; existing statement is unchanged."); }
  return { id, reused: false };
});

export const runStatementCheckpoint = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((raw: unknown) => z.object({ batch: z.string().uuid(), operation: z.string().uuid() }).parse(raw)).handler(async ({ data, context }) => {
  const db = context.supabase;
  const b = await db.from("import_batches").select("*").eq("id", data.batch).eq("owner_id", context.userId).single();
  if (b.error) throw Error("Statement unavailable");
  const a = await db.from("accounts").select("*").eq("id", b.data.account_id).eq("owner_id", context.userId).single();
  if (a.error) throw Error("Statement account unavailable");
  const account: Account = { id: a.data.id, name: a.data.name, kind: a.data.kind as Account["kind"], openingBalance: Number(a.data.opening_balance), archived: a.data.archived };
  const rows: ImportRow[] = [], posted: StatementStatusEvidence["posted"] = [], transactions: Expense[] = [];
  for (let from = 0;; from += 1000) {
    const r = await db.from("import_rows").select("*").eq("batch_id", b.data.id).eq("owner_id", context.userId).order("id").range(from, from + 999);
    if (r.error) throw Error("Statement rows unavailable"); rows.push(...r.data as unknown as ImportRow[]); if (r.data.length < 1000) break;
  }
  for (let from = 0;; from += 1000) {
    const r = await db.from("import_posts").select("fingerprint,transaction_id,posted_at").eq("account_id", account.id).eq("owner_id", context.userId).order("fingerprint").range(from, from + 999);
    if (r.error) throw Error("Posting evidence unavailable"); posted.push(...r.data); if (r.data.length < 1000) break;
  }
  for (let from = 0;; from += 1000) {
    const r = await db.from("expenses").select("*").eq("employee_id", context.userId).or(`account_id.eq.${account.id},to_account_id.eq.${account.id}`).order("id").range(from, from + 999);
    if (r.error) throw Error("Ledger unavailable");
    transactions.push(...r.data.map(t => ({ id: t.id, correctionRevision: t.correction_revision, title: t.title, merchant: t.merchant, category: t.category, scope: t.scope as Expense["scope"], memberId: t.member_id, splits: [], receipts: [], amount: Number(t.amount), originalAmount: Number(t.original_amount ?? t.amount), currency: t.currency, fxRate: Number(t.fx_rate), paymentMethod: t.payment_method as Expense["paymentMethod"], date: t.expense_date, description: t.description, txnType: t.txn_type as NonNullable<Expense["txnType"]>, accountId: t.account_id, toAccountId: t.to_account_id, principal: t.principal == null ? null : Number(t.principal), interest: t.interest == null ? null : Number(t.interest), adjustmentSign: t.adjustment_sign === -1 ? -1 as const : 1 as const, reconciledAt: t.reconciled_at, statementRef: t.statement_ref })));
    if (r.data.length < 1000) break;
  }
  const prefs = await db.from("finance_preferences").select("data").eq("owner_id", context.userId).maybeSingle();
  if (prefs.error) throw Error("Account policy unavailable");
  const evidence: StatementStatusEvidence = { batch: b.data as unknown as ImportBatch, rows, posted };
  const snapshot = checkpointSnapshot(evidence, account, transactions), hash = await checkpointHash(snapshot);
  const result = accountStatementStatus(account, [evidence], transactions, normalizePreferences(prefs.data?.data as Partial<FinancePreferences> | null), new Date().toISOString().slice(0, 10), true);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const saved = await supabaseAdmin.rpc("record_statement_checkpoint", { _id: data.operation, _owner: context.userId, _batch: data.batch, _expected: snapshot.expected as unknown as Json, _ledger: snapshot.ledger as unknown as Json, _rows: snapshot.rows as unknown as Json, _posts: snapshot.posts as unknown as Json, _hash: hash, _result: { reconciliation: result.reconciliation, balance: result.balance, difference: result.difference, unresolved: result.unresolved, matched: result.matched } });
  if (saved.error) throw Error(saved.error.message);
  return { reconciliation: result.reconciliation, balance: result.balance, difference: result.difference, unresolved: result.unresolved };
});