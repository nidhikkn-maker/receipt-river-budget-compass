/**
 * Opening-balance workflow for one audited year [v6 §19]: link each audited balance to accounts, see the
 * difference per account, then post dated opening entries (1 April) in one atomic, undoable step.
 */
import { LoadError } from "@/components/LoadError";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import { fyRange } from "@/lib/entities";
import { ACCOUNT_LABEL, accountBalance, type AccountKind } from "@/lib/ledger";
import { HEAD_LABEL, nextFy, openingBalanceSheet, openingPlan, openingPostingId, POSTABLE_HEADS, type OpeningLink } from "@/lib/books/fy";
import { periodBlocker } from "@/lib/books/periods";
import type { FyRecord, OpeningHead } from "@/lib/books/types";
import { useBooks } from "./useBooks";

const inr = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const KINDS: Partial<Record<OpeningHead, AccountKind[]>> = {
  bank: ["savings", "current"], cash: ["cash", "wallet"], investments: ["investment", "fixed_deposit"], receivables: ["other_asset"],
  loans: ["loan"], payables: ["other_liability", "credit_card"], taxBalances: ["other_asset", "other_liability"], other: ["other_asset", "other_liability"],
};
type Posting = Awaited<ReturnType<ReturnType<typeof useStore>["openingPostings"]>>[number];

export function OpeningBalances({ rec, missingSchedules }: { rec: FyRecord; missingSchedules: string[] }) {
  const { books } = useBooks();
  const { accounts, transactions, postOpening, undoOpening, openingPostings, userId } = useStore();
  const entityAccounts = useMemo(() => new Set(books.entityAccounts?.[rec.entityId] ?? []), [books.entityAccounts, rec.entityId]);
  const fyEnd = fyRange(rec.fy).end;
  const upTo = useMemo(() => transactions.filter((t) => t.date <= fyEnd), [transactions, fyEnd]);
  const [links, setLinks] = useState<Partial<Record<OpeningHead, OpeningLink[]>>>(() => {
    // Prefill only when exactly one of the entity's accounts fits the head — never guess between several.
    const out: Partial<Record<OpeningHead, OpeningLink[]>> = {};
    for (const h of POSTABLE_HEADS) {
      const v = rec.audited[h]; if (v == null) continue;
      const fit = accounts.filter((a) => !a.archived && entityAccounts.has(a.id) && (KINDS[h] ?? []).includes(a.kind));
      if (fit.length === 1 && h !== "taxBalances" && h !== "other") out[h] = [{ accountId: fit[0]!.id, target: v }];
    }
    return out;
  });
  const [why, setWhy] = useState<Partial<Record<OpeningHead | "balance" | "schedules", string>>>({});
  const [posted, setPosted] = useState<Posting[] | null>(null);
  // A failed read must not look like "nothing posted": posting again could duplicate opening entries (P0-004/P0-019).
  const [postedFailed, setPostedFailed] = useState(false);
  const load = () => openingPostings().then((r) => { setPosted(r.filter((p) => p.entity_id === rec.entityId && p.fy === rec.fy)); setPostedFailed(false); }).catch(() => setPostedFailed(true));
  useEffect(() => { void load(); }, [rec.entityId, rec.fy]); // eslint-disable-line react-hooks/exhaustive-deps
  const active = posted?.find((p) => !p.undone_at) ?? null;

  const plan = openingPlan({ rec, links, exceptions: why, accounts, txns: transactions, missingSchedules, fyEnd });
  const lock = periodBlocker(books.closedPeriods, plan.openingDate);
  const blockers = [...plan.blockers, ...(lock ? [lock] : [])];
  const name = (id: string) => accounts.find((a) => a.id === id)?.name ?? "Account";
  const choices = (h: OpeningHead) => accounts.filter((a) => !a.archived && (KINDS[h] ?? []).includes(a.kind)).sort((a, b) => Number(entityAccounts.has(b.id)) - Number(entityAccounts.has(a.id)));
  const setLine = (h: OpeningHead, i: number, v: Partial<OpeningLink>) => setLinks((l) => ({ ...l, [h]: (l[h] ?? []).map((x, j) => (j === i ? { ...x, ...v } : x)) }));

  const post = async () => {
    const id = openingPostingId(userId, rec.entityId, rec.fy, (posted ?? []).length);
    await postOpening({
      id, entityId: rec.entityId, fy: rec.fy, date: plan.openingDate, docId: rec.docIds[0] ?? null,
      exceptions: Object.entries(why).filter(([, v]) => (v ?? "").trim().length >= 5).map(([line, reason]) => ({ line, reason: reason!.trim() })),
      lines: plan.postings.map((x) => ({ txnId: x.txnId, accountId: x.accountId, amount: x.amount, sign: x.sign, head: x.head, target: x.target, current: x.current,
        title: `Opening balance FY ${nextFy(rec.fy)} — ${name(x.accountId)}`, description: `${HEAD_LABEL[x.head]}: ${inr(x.current)} in Thapal at ${fyEnd} set to audited ${inr(x.target)}` })),
    });
    toast.success(plan.postings.length ? `${plan.postings.length} starting balance${plan.postings.length > 1 ? "s" : ""} saved for ${plan.openingDate}` : "Opening balances recorded — every account already agrees");
    await load();
  };

  if (postedFailed) return <LoadError what="the opening entries already posted" note="Nothing has been deleted. Posting waits until they load, so nothing is posted twice." onRetry={load} />;
  if (active) {
    const lines = (active.lines as { accountId: string; head: OpeningHead; target: number }[]) ?? [];
    return <div className="space-y-1 rounded-lg bg-secondary p-2 text-xs">
      <p className="font-semibold text-primary">Opening entries posted {active.posted_at.slice(0, 10)} · dated {active.opening_date}</p>
      {lines.map((l) => { const a = accounts.find((x) => x.id === l.accountId); const now = a ? accountBalance(a, transactions.filter((t) => t.date <= active.opening_date)) : null;
        return <p key={l.accountId} className="break-words">{HEAD_LABEL[l.head]} · {name(l.accountId)}: target {inr(l.target)} — {now == null ? "account removed" : Math.abs(now - l.target) < 1 ? "agrees" : `now ${inr(now)} (difference ${inr(now - l.target)})`}</p>; })}
      {!lines.length && <p>No entries were needed — every linked account agreed.</p>}
      <Button size="sm" variant="ghost" onClick={async () => { try { await undoOpening(active.id); toast.success("Opening entries removed"); await load(); } catch (e) { toast.error((e as Error).message); } }}>Undo opening entries</Button>
    </div>;
  }

  return (
    <div className="space-y-2 rounded-lg border p-2 text-xs">
      {(() => { const bs = openingBalanceSheet(rec); return <div className="rounded-md border p-2"><p className="font-semibold">Opening balance sheet · 1 April {plan.openingDate.slice(0, 4)}</p>
        <div className="mt-1 grid gap-2 sm:grid-cols-2"><div><p className="text-muted-foreground">Assets</p>{bs.assets.map((x) => <p key={x.head} className="flex justify-between gap-2"><span>{HEAD_LABEL[x.head]}</span><span>{inr(x.amount)}</span></p>)}{rec.audited.accumulatedDepreciation != null && <p className="flex justify-between gap-2"><span>Less accumulated depreciation</span><span>−{inr(rec.audited.accumulatedDepreciation)}</span></p>}<p className="flex justify-between gap-2 border-t font-semibold"><span>Total assets</span><span>{inr(bs.totalAssets)}</span></p></div>
          <div><p className="text-muted-foreground">Owner's money & what is owed <span className="text-xs">(capital & liabilities)</span></p>{bs.liabilities.map((x) => <p key={x.head} className="flex justify-between gap-2"><span>{HEAD_LABEL[x.head]}</span><span>{inr(x.amount)}</span></p>)}<p className="flex justify-between gap-2 border-t font-semibold"><span>Total</span><span>{inr(bs.totalLiabilities)}</span></p></div></div>
        <p className={bs.balanced ? "mt-1 text-primary" : "mt-1 text-destructive"}>{bs.balanced ? "Balances — both sides agree" : `Does not balance by ${inr(bs.difference)}`}{bs.missing.length ? ` · not in the upload: ${bs.missing.map((h) => HEAD_LABEL[h]).join(", ")}` : ""}</p></div>; })()}
      <p className="font-semibold">Post opening balances for FY {nextFy(rec.fy)} (dated {plan.openingDate})</p>
      {plan.rows.map((r) => <div key={r.head} className="space-y-1 border-b pb-2 last:border-0">
        <div className="flex flex-wrap justify-between gap-1"><span className="font-medium">{HEAD_LABEL[r.head]}</span><span>{r.audited == null ? "not in upload" : `audited ${inr(r.audited)}`} · <span className={r.status === "unlinked" || r.status === "split mismatch" ? "text-destructive" : "text-muted-foreground"}>{r.status}</span></span></div>
        {r.note && <p className="text-muted-foreground">{r.note}</p>}
        {POSTABLE_HEADS.includes(r.head) && r.audited != null && <>
          {(links[r.head] ?? []).map((l, i) => { const a = accounts.find((x) => x.id === l.accountId); const cur = a ? accountBalance(a, upTo) : 0;
            return <div key={i} className="grid grid-cols-[minmax(0,1fr)_7rem_auto] items-center gap-1">
              <select aria-label={`${HEAD_LABEL[r.head]} account`} className="min-w-0 rounded-md border bg-background px-1 py-1" value={l.accountId} onChange={(e) => setLine(r.head, i, { accountId: e.target.value })}>{choices(r.head).map((a) => <option key={a.id} value={a.id}>{a.name} · {ACCOUNT_LABEL[a.kind]}</option>)}</select>
              <Input aria-label="Opening amount for this account" className="h-8" type="number" value={String(l.target)} onChange={(e) => setLine(r.head, i, { target: Number(e.target.value) || 0 })} />
              <button type="button" className="px-1 text-muted-foreground" aria-label="Remove account" onClick={() => setLinks((x) => ({ ...x, [r.head]: (x[r.head] ?? []).filter((_, j) => j !== i) }))}>×</button>
              <p className="col-span-3 text-muted-foreground">In Thapal at {fyEnd}: {inr(cur)} → entry {Math.abs(l.target - cur) < 0.005 ? "not needed" : `${l.target > cur ? "+" : "−"}${inr(Math.abs(l.target - cur))}`}</p>
            </div>; })}
          {choices(r.head).length > 0 && <button type="button" className="text-primary underline" onClick={() => { const left = (r.audited ?? 0) - (links[r.head] ?? []).reduce((s, x) => s + x.target, 0); setLinks((x) => ({ ...x, [r.head]: [...(x[r.head] ?? []), { accountId: choices(r.head)[0]!.id, target: Math.round(left * 100) / 100 }] })); }}>+ Link an account</button>}
          {(r.status === "unlinked" || r.status === "split mismatch" || r.status === "exception" || why[r.head]) && <Input aria-label={`Reason for ${HEAD_LABEL[r.head]}`} className="h-8" placeholder="Or write why this line is left as it is" value={why[r.head] ?? ""} onChange={(e) => setWhy({ ...why, [r.head]: e.target.value })} />}
        </>}
      </div>)}
      {plan.blockers.some((b) => /balance|don't balance|schedule may/i.test(b)) && <Input aria-label="Reason the audited figures don't balance" className="h-8" placeholder="Why the audited figures don't balance (kept as an exception)" value={why.balance ?? ""} onChange={(e) => setWhy({ ...why, balance: e.target.value })} />}
      {plan.blockers.some((b) => b.startsWith("Schedules")) && <Input aria-label="Reason schedules are missing" className="h-8" placeholder="Why the missing schedules aren't needed (kept as an exception)" value={why.schedules ?? ""} onChange={(e) => setWhy({ ...why, schedules: e.target.value })} />}
      {blockers.length > 0 && <ul className="list-disc pl-4 text-destructive">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>}
      <Button size="sm" disabled={blockers.length > 0 || posted == null} onClick={() => post().catch((e: Error) => toast.error(e.message))}>
        {plan.postings.length ? `Save ${plan.postings.length} starting balance${plan.postings.length > 1 ? "s" : ""} for the new year` : "Record starting balances (nothing new to save)"}
      </Button>
      <p className="text-[11px] text-muted-foreground">Opening entries never count as income or spending. They are saved once, linked to the audited document, and can be undone together while unedited.</p>
    </div>
  );
}
