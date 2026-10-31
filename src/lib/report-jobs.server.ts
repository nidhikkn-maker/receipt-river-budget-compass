// Server-side completion of reports whose app was closed before the PDF was saved.
// Loads only the job owner's records, reuses the same pure report builder, and saves to report history.
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";
import { REPORT_TYPES, buildReportDoc, reportLabel, type ReportFilters, type ReportType, type DraftLite } from "./report-centre";
import { accountBalance } from "./ledger";
import { normalizePreferences } from "./preferences";
import type { TravelTrip } from "./travel";

const n = (x: unknown) => (x == null ? null : Number(x));

export async function loadOwnerReportData(db: SupabaseClient<any>, owner: string, today: string) {
  const [e, a, c, l, v, b, m, p, d] = await Promise.all([
    db.from("expenses").select("*").eq("employee_id", owner),
    db.from("accounts").select("*").eq("owner_id", owner),
    db.from("commitments").select("*").eq("owner_id", owner),
    db.from("loans").select("*").eq("owner_id", owner),
    db.from("asset_valuations").select("*").eq("owner_id", owner),
    db.from("category_budgets").select("category, monthly_amount").eq("owner_id", owner),
    db.from("family_members").select("id, name").eq("owner_id", owner),
    db.from("finance_preferences").select("data").eq("owner_id", owner).maybeSingle(),
    db.from("expense_drafts").select("*").eq("owner_id", owner),
  ]);
  const err = [e, a, c, l, v, b, m, p, d].find((x) => x.error)?.error;
  if (err) throw new Error("Couldn't load records");
  const transactions = (e.data ?? []).map((x: any) => ({
    id: x.id, categoryRevision: x.category_revision, department: x.department, title: x.title, merchant: x.merchant, category: x.category, scope: x.scope, memberId: x.member_id, splits: x.splits ?? [],
    amount: Number(x.amount), currency: x.currency, originalAmount: Number(x.original_amount ?? x.amount), fxRate: Number(x.fx_rate),
    paymentMethod: x.payment_method, reconciledAt: x.reconciled_at, statementRef: x.statement_ref, date: x.expense_date, description: x.description, receipts: x.receipts ?? [],
    txnType: x.txn_type, accountId: x.account_id, toAccountId: x.to_account_id, paymentInstrumentId: x.payment_instrument_id, tags: x.tags ?? [], workspaceAllocations: x.workspace_allocations ?? [],
    receiptDetails: x.receipt_details, reimbursementStatus: x.reimbursement_status, adjustmentSign: x.adjustment_sign === -1 ? -1 : 1,
    allocations: x.allocations ?? [], reimbursement: x.reimbursement ?? {}, tripId: x.trip_id, principal: n(x.principal), interest: n(x.interest),
  }));
  const accounts = (a.data ?? []).map((x: any) => ({
    id: x.id, name: x.name, kind: x.kind, openingBalance: Number(x.opening_balance), archived: x.archived, creditLimit: n(x.credit_limit), dueDay: x.due_day, minBalance: Number(x.min_balance),
    issuer: x.issuer, lastFour: x.last_four, statementDay: x.statement_day, interestRate: n(x.interest_rate), includeInCash: x.include_in_cash, details: x.details ?? {},
  }));
  const commitments = (c.data ?? []).map((x: any) => ({ id: x.id, name: x.name, kind: x.kind, direction: x.direction, amount: Number(x.amount), frequency: x.frequency, intervalDays: x.interval_days, nextDue: x.next_due, accountId: x.account_id, category: x.category, confirmed: x.confirmed, essential: x.essential, status: x.status }));
  const loans = (l.data ?? []).map((x: any) => {
    const acc = accounts.find((y: any) => y.id === x.account_id);
    const principal = x.loan_type !== "credit_card_emi" && acc && (acc.kind === "loan" || acc.kind === "other_liability") ? Math.max(0, accountBalance(acc as any, transactions as any)) : Number(x.principal_outstanding);
    return { id: x.id, name: x.name, principal, rate: Number(x.annual_rate), emi: Number(x.emi), nextDue: x.next_due, provider: x.provider, status: x.status === "closed" ? "closed" : "active", payments: x.payments ?? [] };
  });
  const valuations = (v.data ?? []).map((x: any) => ({ id: x.id, accountId: x.account_id, value: Number(x.value), valuedOn: x.valued_on, source: x.source, note: x.note }));
  const budgets: Record<string, number> = Object.fromEntries((b.data ?? []).map((x: any) => [x.category, Number(x.monthly_amount)]));
  const prefs = normalizePreferences(p.data?.data as any);
  const members = m.data ?? [];
  const drafts: DraftLite[] = (d.data ?? []).filter((x: any) => x.status !== "saved").map((x: any) => ({ id: x.id, status: x.status, updatedAt: x.updated_at, data: x.data ?? {} }));
  return {
    transactions, accounts, valuations, commitments, loans, budgets, trips: (prefs.trips ?? []) as TravelTrip[], drafts,
    memberName: (id: string | null) => (!id || id === "me" ? "Me" : members.find((y: any) => y.id === id)?.name ?? "Family"),
    accountName: (id: string | null) => accounts.find((y: any) => y.id === id)?.name ?? "No account", today,
  };
}

/** Builds, stores and records one claimed job. Re-running a finished job is a no-op (history id = job id). */
export async function completeReportJob(db: SupabaseClient<any>, job: { id: string; owner_id: string; kind: string; filters: any; style: string }) {
  if (!REPORT_TYPES.some((r) => r[0] === job.kind)) {
    await db.from("report_jobs").update({ status: "failed", error: "Unknown report type", updated_at: new Date().toISOString() }).eq("id", job.id);
    return;
  }
  const exists = await db.from("report_history").select("id").eq("id", job.id).maybeSingle();
  if (!exists.data) {
    const today = new Date().toISOString().slice(0, 10);
    const data = await loadOwnerReportData(db, job.owner_id, today);
    const filters = job.filters as ReportFilters;
    const doc = buildReportDoc(job.kind as ReportType, filters, data as any);
    const { renderReportPdf } = await import("./report-pdf");
    const blob = await renderReportPdf(doc, job.style as any, new Date());
    const path = `${job.owner_id}/reports/${job.id}.pdf`;
    const up = await db.storage.from("receipts").upload(path, blob, { contentType: "application/pdf", upsert: true });
    if (up.error) throw new Error("Couldn't store the PDF");
    const prior = await db.from("report_history").select("id", { count: "exact", head: true }).eq("owner_id", job.owner_id).eq("kind", job.kind).eq("period_from", filters.from).eq("period_to", filters.to);
    const ins = await db.from("report_history").insert({ id: job.id, owner_id: job.owner_id, kind: job.kind, title: reportLabel(job.kind as ReportType), period_from: filters.from, period_to: filters.to, workspace: filters.workspaces?.join(",") || "all", filters: { ...filters, style: job.style }, file_path: path, file_size: blob.size, version: (prior.count ?? 0) + 1 });
    if (ins.error && !/duplicate/i.test(ins.error.message)) throw new Error("Couldn't save report history");
  }
  await db.from("report_jobs").update({ status: "done", error: null, updated_at: new Date().toISOString() }).eq("id", job.id);
}

export async function runReportJobs(db: SupabaseClient<any>) {
  // Jobs that used every attempt are marked failed so the owner can retry.
  await db.from("report_jobs").update({ status: "failed", error: "Couldn't finish in the background", updated_at: new Date().toISOString() })
    .in("status", ["queued", "running"]).gte("attempts", 3).lt("lease_until", new Date().toISOString());
  const { data, error } = await db.rpc("claim_report_jobs", { _limit: 3 });
  if (error) throw new Error("claim failed");
  let done = 0, failed = 0;
  for (const job of (data ?? []) as any[]) {
    try { await completeReportJob(db, job); done++; }
    catch (e) { failed++; await db.from("report_jobs").update({ error: (e as Error).message.slice(0, 200), updated_at: new Date().toISOString() }).eq("id", job.id); }
  }
  return { claimed: (data ?? []).length, done, failed };
}
