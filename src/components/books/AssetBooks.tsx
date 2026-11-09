/** Asset lifecycle, QR labels and the full depreciation engine (v6 §21, §26–34). */
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Fold } from "@/components/Fold";
import { ASSET_KINDS, type Asset } from "@/lib/assets";
import { fyOf } from "@/lib/entities";
import { useStore } from "@/lib/store";
import { saveExpense } from "@/lib/fx.functions";
import { annualBook, blockSchedule, bookVsTax, monthlyBook, prepareJournals } from "@/lib/books/depreciation";
import { applyEvent, depreciationEntry, depreciationEntryKey, depreciationExceptions, disposalResult, dueMonths, eventPostings, postingIdFor, resolvePostingIds, suggestPayment } from "@/lib/books/assets-ledger";
import { supabase } from "@/integrations/supabase/client";
import { requiresApproval, type AssetEventKind } from "@/lib/books/types";
import { useBooks } from "./useBooks";

const inr = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const today = () => new Date().toISOString().slice(0, 10);
const EVENT: Record<AssetEventKind, string> = { received: "Received", capitalised: "Capitalised", location: "Moved location", custodian: "New custodian", maintenance: "Maintenance", transfer: "Transferred to department", verified: "Physically verified", impairment: "Impairment (write-down)", revaluation: "Revaluation", disposal: "Disposed / sold", missing: "Reported missing", damaged: "Reported damaged" };
const NEEDS_TO: AssetEventKind[] = ["location", "custodian", "transfer"];
const NEEDS_VALUE: AssetEventKind[] = ["impairment", "revaluation", "disposal"];

/** QR label encoding the asset tag and id, for printing and stick-on verification. */
export function AssetQr({ a }: { a: Asset }) {
  const [svg, setSvg] = useState("");
  useEffect(() => { let live = true; import("qrcode").then((q) => q.toString(`LEDGERLINE-ASSET:${a.tag || a.id}`, { type: "svg", margin: 1, width: 120 })).then((s) => { if (live) setSvg(s); }).catch(() => undefined); return () => { live = false; }; }, [a.id, a.tag]);
  if (!svg) return null;
  return <figure className="inline-block rounded-lg border bg-background p-1 text-center text-[10px]"><span className="block size-24 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} /><figcaption>{a.tag || a.id.slice(0, 8)}</figcaption></figure>;
}

export function AssetLifecycle({ a }: { a: Asset }) {
  const { books, preferences, savePreferences } = useBooks();
  const { accounts, documents, transactions } = useStore();
  const [kind, setKind] = useState<AssetEventKind>("maintenance");
  const [note, setNote] = useState("");
  const [to, setTo] = useState("");
  const [value, setValue] = useState("");
  const [docId, setDocId] = useState("");
  const events = books.assetEvents.filter((e) => e.assetId === a.id).sort((x, y) => y.date.localeCompare(x.date));
  const months = monthlyBook(a, today().slice(0, 7)).slice(-12);
  const disposal = disposalResult(a);
  const pay = useMemo(() => (a.paymentId ? null : suggestPayment(a, transactions.map((t) => ({ id: t.id, date: t.date, amount: t.amount, text: `${t.title} ${t.merchant ?? ""} ${t.description}`, txnType: t.txnType })))), [a, transactions]);
  const payTxn = transactions.find((t) => t.id === (a.paymentId ?? pay));
  const assetDocs = documents.filter((d) => d.id === a.docId || (a.docIds ?? []).includes(d.id));
  const putAsset = (next: Asset, extra: Partial<typeof books> = {}) => savePreferences({ ...preferences, assets: (preferences.assets ?? []).map((x) => (x.id === a.id ? next : x)), books: { ...books, ...extra } });

  const record = async () => {
    const v = Number(value);
    if (NEEDS_TO.includes(kind) && !to.trim()) { toast.error("Say where / to whom"); return; }
    if (NEEDS_VALUE.includes(kind) && kind !== "disposal" && !(v > 0) && kind === "impairment") { toast.error("Enter the write-down amount"); return; }
    const e = { id: crypto.randomUUID(), assetId: a.id, date: today(), kind, note, ...(to.trim() ? { to: to.trim() } : {}), ...(value.trim() && Number.isFinite(v) ? { value: v } : {}), ...(docId ? { docId } : {}), applied: true };
    const next = applyEvent(a, e);
    await putAsset(docId && !(next.docIds ?? []).includes(docId) ? { ...next, docIds: [...(next.docIds ?? []), docId] } : next, { assetEvents: [...books.assetEvents, e] });
    setNote(""); setTo(""); setValue(""); setDocId("");
    toast.success(kind === "disposal" ? "Disposal recorded — depreciation stops from this date" : "Recorded");
  };

  return (
    <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Lifecycle, documents, label & monthly depreciation ({events.length} events)</summary>
      <div className="mt-2 flex flex-wrap items-start gap-3">
        <AssetQr a={a} />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-muted-foreground">{[a.purchaseDate && `bought ${a.purchaseDate}`, a.capitalisedOn && `capitalised ${a.capitalisedOn}`, `in use ${a.inUse}`, a.condition && a.condition !== "ok" && `condition: ${a.condition}`].filter(Boolean).join(" · ")}</p>
          {disposal && <p>Disposed {a.soldOn}: proceeds {inr(disposal.proceeds)} vs book value {inr(disposal.nbv)} → {disposal.gain >= 0 ? "gain" : "loss"} {inr(Math.abs(disposal.gain))}</p>}
          {events.map((e) => <p key={e.id}>{e.date} · {EVENT[e.kind]}{e.to ? ` → ${e.to}` : ""}{e.value ? ` · ${inr(e.value)}` : ""}{e.note ? ` · ${e.note}` : ""}{e.docId ? " · 📎" : ""}</p>)}
          <div className="flex flex-wrap gap-1"><select aria-label="Event" className="rounded-md border bg-background px-1" value={kind} onChange={(e) => setKind(e.target.value as AssetEventKind)}>{Object.entries(EVENT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            {NEEDS_TO.includes(kind) && <input aria-label="New location, custodian or department" className="min-w-0 flex-1 rounded-md border bg-background px-2" placeholder={kind === "transfer" ? "Department" : kind === "custodian" ? "Custodian" : "Location"} value={to} onChange={(e) => setTo(e.target.value)} />}
            {NEEDS_VALUE.includes(kind) && <input aria-label="Amount" type="number" className="w-28 rounded-md border bg-background px-2" placeholder={kind === "disposal" ? "Sale proceeds" : kind === "impairment" ? "Write-down ₹" : "Change ₹ (±)"} value={value} onChange={(e) => setValue(e.target.value)} />}
            <input aria-label="Event note" className="min-w-0 flex-1 rounded-md border bg-background px-2" placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} />
            <select aria-label="Supporting document" className="max-w-40 rounded-md border bg-background px-1" value={docId} onChange={(e) => setDocId(e.target.value)}><option value="">No document</option>{documents.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select>
            <Button size="sm" variant="outline" className="h-7" onClick={record}>Add</Button></div>
          <div className="flex flex-wrap items-center gap-2">
            <label>Ledger asset account<select className="ml-1 rounded-md border bg-background px-1" value={a.accountId ?? ""} onChange={(e) => void putAsset({ ...a, accountId: e.target.value || undefined })}><option value="">Not linked</option>{accounts.filter((x) => !x.archived && ["other_asset", "investment"].includes(x.kind)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
            <Link to="/statements" search={{ context: "assets" }} className="text-primary underline">Upload maintenance, photo, valuation or disposal paper</Link>
          </div>
          {assetDocs.length > 0 && <p>Documents: {assetDocs.map((d) => d.title).join(" · ")}</p>}
          {payTxn && <p>{a.paymentId ? "Paid by" : "Likely payment"}: {payTxn.date} · {payTxn.title} · {inr(payTxn.amount)} {!a.paymentId && <Button size="sm" variant="ghost" className="h-6" onClick={() => void putAsset({ ...a, paymentId: payTxn.id })}>Link</Button>}</p>}
        </div>
      </div>
      {months.length > 0 && <div className="mt-2 space-y-1 sm:hidden">{months.map((m) => <p key={m.month} className="flex justify-between"><span>{m.month}</span><span>{inr(m.depreciation)} · NBV {inr(m.nbv)}</span></p>)}</div>}
      {months.length > 0 && <table className="mt-2 hidden w-full sm:table"><thead><tr className="text-muted-foreground"><th className="text-left">Month</th><th className="text-right">Depreciation</th><th className="text-right">Accumulated</th><th className="text-right">Net book value</th></tr></thead>
        <tbody>{months.map((m) => <tr key={m.month}><td>{m.month}</td><td className="text-right">{inr(m.depreciation)}</td><td className="text-right">{inr(m.accumulated)}</td><td className="text-right">{inr(m.nbv)}</td></tr>)}</tbody></table>}
    </details>
  );
}

/** Which of these ids are the owner's own saved entries (owner-filtered read; never guesses on failure). */
async function savedEntryIds(owner: string, ids: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase.from("expenses").select("id").eq("employee_id", owner).in("id", ids.slice(i, i + 100));
    if (error) throw Error("Couldn't check which entries are already posted. Nothing was posted; try again.");
    for (const r of data ?? []) found.add(r.id);
  }
  return found;
}

export function DepreciationBooks() {
  const { books, save, preferences } = useBooks();
  const { ensureCategory, transactions: allTx, userId } = useStore();
  const [evBusy, setEvBusy] = useState(false);
  const [pendingEv, setPendingEv] = useState<{ id: string; p: import("@/lib/books/assets-ledger").EventPosting }[]>([]);
  const [evProblems, setEvProblems] = useState<string[]>([]);
  const post = useServerFn(saveExpense);
  const assets = (preferences.assets ?? []).filter((a) => a.kind !== "property");
  const fy = fyOf(today());
  const [busy, setBusy] = useState(false);
  const blocks = blockSchedule(assets, fy);
  const vs = bookVsTax(assets, fy);
  const prepared = books.journals.filter((j) => j.status === "prepared");
  const exceptions = assets.filter((a) => !a.soldOn).map((a) => ({ a, x: depreciationExceptions(a) })).filter((r) => r.x.length);
  const autoRan = useRef(false);

  // Monthly run: on opening, prepare every completed month not yet prepared (open periods only) [§34].
  useEffect(() => {
    if (autoRan.current || !assets.length) return;
    autoRan.current = true;
    const t = today();
    let all = books.journals; const notes: string[] = [];
    const months = [...new Set(assets.flatMap((a) => dueMonths(a, all, t)))].sort();
    for (const m of months) { const r = prepareJournals(assets, m, all, books.closedPeriods, () => crypto.randomUUID()); all = [...all, ...r.journals]; notes.push(...r.exceptions); }
    if (all.length > books.journals.length) void save({ journals: all }).then(() => toast.message(`Depreciation prepared for ${all.length - books.journals.length} asset-month(s) — review and approve below`));
    else if (notes.length) toast.message(notes.slice(0, 2).join(" · "));
  }, [assets.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let live = true;
    void (async () => {
      const have = new Set(allTx.map((t) => t.id)); const out: { id: string; p: import("@/lib/books/assets-ledger").EventPosting }[] = []; const probs: string[] = [];
      for (const a of assets) { const r = eventPostings(a, books.closedPeriods); probs.push(...r.problems); for (const p of r.postings) { const { id, posted } = await postingIdFor(userId, p.key, have); if (!posted) out.push({ id, p }); } }
      if (live) { setPendingEv(out); setEvProblems(probs); }
    })().catch(() => { if (live) setPendingEv([]); });
    return () => { live = false; };
  }, [assets, allTx, books.closedPeriods, userId]);
  const postEvents = async () => {
    setEvBusy(true); let ok = 0; const problems: string[] = [];
    try {
      for (const c of ["Impairment", "Asset disposal"]) await ensureCategory(c).catch(() => undefined);
      // Re-check against saved records: the list on screen may not hold every entry (legacy ids are reused).
      const ids = await resolvePostingIds(userId, pendingEv.map(({ p }) => p.key), (x) => savedEntryIds(userId, x));
      for (const [i, { p }] of pendingEv.entries()) {
        const { id, posted } = ids[i]!;
        if (posted) continue;
        const res = await post({ data: { id: null, createId: id, title: p.title, merchant: null, category: p.kind === "impairment" ? "Impairment" : "Asset disposal", scope: "business", workspaceAllocations: [], memberId: null, splits: [], currency: "INR", originalAmount: p.amount, date: p.date, description: p.description, paymentMethod: "other", txnType: "adjustment", reimbursementStatus: "none", adjustmentSign: -1, accountId: p.accountId, toAccountId: null, paymentInstrumentId: null, payeeId: null, tripId: null, principal: null, interest: null, tags: [p.kind] } });
        if (res.ok) ok++; else problems.push(`${p.title}: ${res.error}`);
      }
      if (ok) toast.success(`${ok} write-down/disposal entr${ok === 1 ? "y" : "ies"} posted`);
      if (problems.length) toast.error(problems.slice(0, 3).join(" · "));
    } catch (e) { toast.error((e as Error).message); } finally { setEvBusy(false); }
  };
  const approve = async () => {
    setBusy(true);
    const posted: Record<string, { tx: string; on: string }> = {}; const problems: string[] = [];
    try {
      await ensureCategory("Depreciation").catch(() => undefined);
      // Ids are checked against saved records so a legacy entry is reused even when it is not on screen.
      const ids = await resolvePostingIds(userId, prepared.map((j) => depreciationEntryKey(j.assetId, j.period)), (x) => savedEntryIds(userId, x));
      for (const [i, j] of prepared.entries()) {
        const r = depreciationEntry(j, assets.find((a) => a.id === j.assetId), books.closedPeriods);
        if (!r.ok) { problems.push(r.reason); continue; }
        const { id } = ids[i]!;
        const res = await post({ data: { id: null, createId: id, title: r.entry.title, merchant: null, category: r.entry.category, scope: "business", workspaceAllocations: [], memberId: null, splits: [], currency: "INR", originalAmount: r.entry.amount, date: r.entry.date, description: r.entry.description, paymentMethod: "other", txnType: "adjustment", reimbursementStatus: "none", adjustmentSign: -1, accountId: r.entry.accountId, toAccountId: null, paymentInstrumentId: null, payeeId: null, tripId: null, principal: null, interest: null, tags: ["depreciation"] } });
        if (!res.ok) { problems.push(`${j.period}: ${res.error}`); continue; }
        posted[j.id] = { tx: id, on: today() };
      }
      if (Object.keys(posted).length) await save({ journals: books.journals.map((j) => (posted[j.id] ? { ...j, status: "posted" as const, postedOn: posted[j.id]!.on, transactionId: posted[j.id]!.tx } : j)) });
      if (Object.keys(posted).length) toast.success(`${Object.keys(posted).length} depreciation entr${Object.keys(posted).length === 1 ? "y" : "ies"} posted to your records`);
      if (problems.length) toast.error([...new Set(problems)].slice(0, 3).join(" · "));
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Fold id="depreciation" title="Change in value of things I own" hint={`FY ${fy} · ${prepared.length} monthly value change${prepared.length === 1 ? "" : "s"} waiting for your approval (depreciation)`}>
      <div className="space-y-3 text-xs">
        {exceptions.length > 0 && <div className="rounded-lg bg-destructive/10 p-2 text-destructive"><p className="font-semibold">Exceptions</p>{exceptions.map((r) => <p key={r.a.id}>{r.a.name}: {r.x.join(", ")}</p>)}</div>}
        <p className="text-sm text-foreground">Things like computers and vehicles are recorded as losing value each year. No money leaves your account — it only changes their recorded value. The tables below use the official income-tax terms your accountant needs.</p>
        <p className="font-semibold">Income-tax blocks (WDV)</p>
        <div className="overflow-x-auto"><table className="w-full min-w-[480px]"><thead><tr className="text-muted-foreground"><th className="text-left">Block</th><th className="text-right">Opening</th><th className="text-right">Additions</th><th className="text-right">Disposals</th><th className="text-right">Depreciation</th><th className="text-right">Closing</th></tr></thead>
          <tbody>{blocks.map((b) => <tr key={b.kind}><td>{ASSET_KINDS[b.kind]} {b.rate}%</td><td className="text-right">{inr(b.opening)}</td><td className="text-right">{inr(b.additionsFull + b.additionsHalf)}{b.additionsHalf ? "*" : ""}</td><td className="text-right">{inr(b.disposals)}</td><td className="text-right">{inr(b.depreciation)}</td><td className="text-right">{inr(b.closing)}</td></tr>)}</tbody></table></div>
        <p className="text-muted-foreground">* used under 180 days in the year — half rate.</p>
        <p className="font-semibold">Book vs tax · FY {fy}</p>
        <div className="space-y-1">{vs.map((v) => { const a = assets.find((x) => x.id === v.assetId)!; return <div key={v.assetId} className="flex flex-wrap justify-between gap-2 border-b py-1"><span>{v.name}</span><span>book {inr(v.book)} · tax {inr(v.tax)} · diff {inr(v.difference)} · NBV {inr(annualBook(a, fy).nbv)}</span></div>; })}</div>
        {prepared.length > 0 && <Button size="sm" loading={busy} onClick={approve}>{requiresApproval(books.policy, "postDepreciation") ? "Approve & add" : "Add"} {prepared.length} value change{prepared.length === 1 ? "" : "s"} to my records</Button>}
        {pendingEv.length > 0 && <div className="space-y-1 rounded-lg border p-2"><p className="font-semibold">Value reductions & items sold or scrapped — waiting for your approval</p>{pendingEv.map(({ id, p }) => <p key={id}>{p.date} · {p.title} · {inr(p.amount)} — lowers the asset account (non-cash)</p>)}<Button size="sm" loading={evBusy} onClick={postEvents}>{requiresApproval(books.policy, "postDepreciation") ? "Approve & add" : "Add"} {pendingEv.length} to my records</Button></div>}
        {evProblems.length > 0 && <p className="text-destructive">{[...new Set(evProblems)].join(" · ")}</p>}
        {prepared.map((j) => <p key={j.id}>{j.period} · {assets.find((a) => a.id === j.assetId)?.name} · {inr(j.amount)} — lowers its recorded value <span className="text-muted-foreground">(Dr Depreciation / Cr asset account)</span></p>)}
        <p className="text-muted-foreground">Approved depreciation is saved once per asset per month as a non-cash entry that lowers the asset's own account — never a bank account. Closed months are refused; a retry never posts twice.</p>
      </div>
    </Fold>
  );
}
