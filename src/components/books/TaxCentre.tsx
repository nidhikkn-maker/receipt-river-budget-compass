/** Tax & audit centre sections: past-year onboarding, tax profiles, GST returns and rule register (v6 §17–20, §45–51). */
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Fold } from "@/components/Fold";
import { useStore } from "@/lib/store";
import { ENTITY_KINDS, fyRange } from "@/lib/entities";
import { accountBalance } from "@/lib/ledger";
import { booksHeads, HEAD_LABEL, confirmOpening, nextFy, openingProposal } from "@/lib/books/fy";
import { REQUIRED_SCHEDULES } from "@/lib/books/intake";
import { annualSummary, duplicateInvoices, gstr1, gstr3b, gstr9, invoiceProblems, matchGstPayments, unfiledPeriods } from "@/lib/books/gst";
import { activateRule, OFFICIAL_SOURCES, proposeRule, ruleOn, validateRule, formFor } from "@/lib/books/regulatory";
import type { GstInvoice, OpeningHead, RuleArea, TaxProfile } from "@/lib/books/types";
import { supabase } from "@/integrations/supabase/client";
import { useBooks, useDemat } from "./useBooks";
import { taxComputation } from "@/lib/books/taxcomp";
import { CREDIT_LABEL, creditsFor, itcReview, ledgerTaxPayments, obligations, ruleImpact, type CreditKind } from "@/lib/books/compliance";
import { estimateTax, rulesFor } from "@/lib/tax-rules";

const inr = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const today = () => new Date().toISOString().slice(0, 10);

export function FyOnboarding() {
  const { books, save } = useBooks();
  const { preferences, accounts, transactions } = useStore();
  const entities = preferences.entities ?? [];
  const [loss, setLoss] = useState<Record<string, { amount: string; kind: "business" | "capital" | "depreciation" | "house" }>>({});
  return (
    <Fold id="past-years" title="Financial year onboarding" hint={`${books.fyRecords.length} past year${books.fyRecords.length === 1 ? "" : "s"} on record`}>
      <div className="space-y-3 text-sm">
        <Link to="/statements" search={{ context: "fy" }} className="inline-block rounded-md border px-3 py-2 font-semibold text-primary">Upload audited accounts, trial balance or return</Link>
        <p className="text-xs text-muted-foreground">Balance sheet, P&L, trial balance, cash flow, notes, auditor's report, fixed-asset and depreciation schedules, loan/receivable/payable/investment schedules, tax computation and GST reconciliation. Each one fills in what it contains; nothing missing is filled in for you.</p>
        {books.fyRecords.map((r) => {
          const ent = entities.find((e) => e.id === r.entityId);
          // Per entity, head by head, using only accounts linked to this entity [§19].
          const bookNow: Partial<Record<OpeningHead, number>> = r.confirmedOpening || !r.entityId ? {} : booksHeads({ accounts, txns: transactions, assets: preferences.assets ?? [], accountIds: new Set(books.entityAccounts?.[r.entityId] ?? []), entityId: r.entityId, fyEnd: fyRange(r.fy).end, fy: r.fy });
          const op = openingProposal(r, bookNow);
          const missing = REQUIRED_SCHEDULES.filter((s) => !r.schedules.includes(s));
          return <div key={r.id} className="space-y-2 rounded-xl border p-3">
            <p className="font-semibold">{ent?.name ?? "Unknown entity"} · FY {r.fy} → opening FY {nextFy(r.fy)}</p>
            <table className="w-full text-xs"><thead><tr className="text-muted-foreground"><th className="text-left">Balance</th><th className="text-right">Audited closing</th><th className="text-right">In Ledgerline</th><th className="text-right">Difference</th></tr></thead>
              <tbody>{op.lines.filter((l) => l.audited != null || l.books != null).map((l) => <tr key={l.head}><td>{HEAD_LABEL[l.head]}</td><td className="text-right">{l.audited == null ? "not in upload" : inr(l.audited)}</td><td className="text-right">{l.books == null ? "—" : inr(l.books)}</td><td className={`text-right ${l.difference ? "text-destructive" : ""}`}>{l.difference == null ? "—" : inr(l.difference)}</td></tr>)}</tbody></table>
            {op.balanced === false && <p className="text-xs text-destructive">Audited figures don't balance by {inr(op.gap ?? 0)} — upload the missing schedule rather than adjusting.</p>}
            {op.totalsCheck && <p className="text-xs text-destructive">{op.totalsCheck}</p>}
            {missing.length > 0 && <p className="text-xs text-muted-foreground">Not yet uploaded: {missing.join(", ")}</p>}
            {r.qualifications.length > 0 && <div className="text-xs"><b>Audit qualifications</b>{r.qualifications.map((q) => <p key={q} className="text-muted-foreground">“{q}”</p>)}</div>}
            {r.filedReturns.length > 0 && <p className="text-xs">Filed: {r.filedReturns.map((f) => `${f.form} ack ${f.ack} on ${f.filedOn}`).join("; ")}</p>}
            <div className="text-xs"><b>Losses carried forward</b>{r.lossesCarriedForward.map((l, i) => <p key={i}>{l.kind} from FY {l.fromFy}: {inr(l.amount)}</p>)}
              <div className="mt-1 flex gap-1"><select aria-label="Loss type" className="rounded-md border bg-background px-1" value={loss[r.id]?.kind ?? "business"} onChange={(e) => setLoss({ ...loss, [r.id]: { amount: loss[r.id]?.amount ?? "", kind: e.target.value as "business" } })}><option value="business">Business</option><option value="capital">Capital</option><option value="depreciation">Unabsorbed depreciation</option><option value="house">House property</option></select>
                <Input aria-label="Loss amount" className="h-8 w-28" type="number" placeholder="As per return" value={loss[r.id]?.amount ?? ""} onChange={(e) => setLoss({ ...loss, [r.id]: { kind: loss[r.id]?.kind ?? "business", amount: e.target.value } })} />
                <Button size="sm" variant="ghost" onClick={async () => { const l = loss[r.id]; if (!l || !(Number(l.amount) > 0)) return; await save({ fyRecords: books.fyRecords.map((x) => (x.id === r.id ? { ...x, lossesCarriedForward: [...x.lossesCarriedForward, { fromFy: r.fy, kind: l.kind, amount: Number(l.amount) }] } : x)) }); setLoss({ ...loss, [r.id]: { kind: l.kind, amount: "" } }); }}>Add</Button></div></div>
            {r.confirmedOpening ? <p className="text-xs text-primary">Opening balances confirmed {r.confirmedOn}. The audited source figures above stay unchanged.</p>
              : <Button size="sm" onClick={async () => { await save({ fyRecords: books.fyRecords.map((x) => (x.id === r.id ? confirmOpening(x, today()) : x)) }); toast.success("Opening balances confirmed"); }}>Confirm as opening balances</Button>}
          </div>;
        })}
      </div>
    </Fold>
  );
}

export function TaxProfiles({ fy }: { fy: string }) {
  const { books, save, preferences } = useBooks();
  const { accounts } = useStore();
  const entities = preferences.entities ?? [];
  const upd = (p: TaxProfile) => save({ taxProfiles: [...books.taxProfiles.filter((x) => x.entityId !== p.entityId), p] });
  return (
    <Fold title="Tax profile per company or person" hint={`${books.taxProfiles.length}/${entities.length} set`}>
      <div className="space-y-2 text-sm">
        {entities.length === 0 && <p className="text-muted-foreground">Add a company or person first on <Link to="/entities" className="underline">Companies & years</Link>.</p>}
        {entities.map((e) => {
          const saved = books.taxProfiles.find((x) => x.entityId === e.id);
          // Nothing is assumed: an unsaved profile shows blank choices until confirmed [§45].
          const p = saved ?? ({ entityId: e.id, regime: "", obligations: [], gstScheme: "", auditRequired: false } as unknown as TaxProfile);
          const ready = !!saved && !!saved.regime && !!saved.gstScheme;
          const f = formFor(e.kind, p.hasBusiness ?? e.kind !== "individual", fy);
          return <div key={e.id} className="rounded-xl border p-3">
            <p className="font-semibold">{e.name} <span className="text-xs font-normal text-muted-foreground">{ENTITY_KINDS[e.kind].label}</span></p>
            <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
              <label>Regime<select className="w-full rounded-md border bg-background px-1 py-1" value={p.regime} onChange={(x) => upd({ ...p, regime: x.target.value as "new", confirmedAt: new Date().toISOString() })}><option value="" disabled>Choose…</option><option value="new">New</option><option value="old">Old</option></select></label>
              <label>GST scheme<select className="w-full rounded-md border bg-background px-1 py-1" value={p.gstScheme} onChange={(x) => upd({ ...p, gstScheme: x.target.value as "regular", confirmedAt: new Date().toISOString() })}><option value="" disabled>Choose…</option><option value="none">Not registered</option><option value="regular">Regular (monthly)</option><option value="qrmp">QRMP (quarterly)</option><option value="composition">Composition</option></select></label>
              <label className="col-span-2 flex items-center gap-2"><input type="checkbox" checked={p.hasBusiness ?? e.kind !== "individual"} onChange={(x) => upd({ ...p, hasBusiness: x.target.checked })} />Has business or professional income</label>
              {!ready && <p className="col-span-2 text-destructive">Not confirmed — choose the regime and GST scheme. Tax and GST working stay hidden until then.</p>}
              <label className="col-span-2 flex items-center gap-2"><input type="checkbox" checked={p.auditRequired} onChange={(x) => upd({ ...p, auditRequired: x.target.checked })} />Accounts audited</label>
            </div>
            <details className="mt-1 text-xs"><summary className="cursor-pointer text-muted-foreground">Accounts belonging to {e.name} · {(books.entityAccounts?.[e.id] ?? []).length} linked</summary>
              <div className="mt-1 grid gap-1 sm:grid-cols-2">{accounts.filter((a) => !a.archived).map((a) => { const mine = books.entityAccounts?.[e.id] ?? []; const other = Object.entries(books.entityAccounts ?? {}).find(([k, v]) => k !== e.id && v.includes(a.id)); return <label key={a.id} className={`flex items-center gap-2 ${other ? "opacity-50" : ""}`}><input type="checkbox" disabled={!!other} checked={mine.includes(a.id)} onChange={(x) => save({ entityAccounts: { ...(books.entityAccounts ?? {}), [e.id]: x.target.checked ? [...mine, a.id] : mine.filter((id) => id !== a.id) } })} />{a.name}{other ? " (another entity)" : ""}</label>; })}</div>
              <p className="mt-1 text-[11px] text-muted-foreground">The tax working for {e.name} uses only entries on these accounts, so one entity's money never counts in another's return.</p></details>
            <p className="mt-1 text-xs text-muted-foreground">Obligations: {[f.form, p.auditRequired && (e.kind === "company" ? "Statutory audit + AOC-4/MGT-7" : "Tax audit (3CA/3CB-3CD) if applicable"), p.gstScheme === "regular" && "GSTR-1 + GSTR-3B monthly", p.gstScheme === "qrmp" && "GSTR-1/IFF + GSTR-3B quarterly", p.gstScheme === "composition" && "CMP-08 quarterly + GSTR-4", p.gstScheme !== "none" && "GSTR-9 annual"].filter(Boolean).join(" · ")}</p>
            <p className="text-[11px] text-muted-foreground">{f.note}</p>
          </div>;
        })}
      </div>
    </Fold>
  );
}

const blankInv = (gstin: string): GstInvoice => ({ id: crypto.randomUUID(), gstin, kind: "sales", number: "", date: today(), party: "", partyGstin: "", taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 });

export function GstReturns({ fy }: { fy: string }) {
  const { books, save, preferences } = useBooks();
  const { transactions } = useStore();
  const gstins = (preferences.entities ?? []).flatMap((e) => e.gstins.map((g) => ({ g, name: e.name })));
  const [gstin, setGstin] = useState(gstins[0]?.g ?? "");
  const months = useMemo(() => { const s = Number(fy.slice(0, 4)); return Array.from({ length: 12 }, (_, i) => { const m = 4 + i; const y = m > 12 ? s + 1 : s; return `${y}-${String(((m - 1) % 12) + 1).padStart(2, "0")}`; }).filter((m) => m <= today().slice(0, 7)); }, [fy]);
  const [period, setPeriod] = useState(months.at(-1) ?? "");
  const [inv, setInv] = useState<GstInvoice | null>(null);
  const [filing, setFiling] = useState({ form: "GSTR-3B", arn: "", filedOn: today() });
  if (!gstins.length) return <Fold title="GST returns" hint="Add a GSTIN to a company first"><p className="text-sm text-muted-foreground">Add GSTINs on <Link to="/entities" className="underline">Companies & years</Link>.</p></Fold>;
  const owner = (preferences.entities ?? []).find((e) => e.gstins.includes(gstin));
  const profile = books.taxProfiles.find((p) => p.entityId === owner?.id);
  const itc = itcReview(books.gstInvoices, gstin, period);
  const eligibleKeys = new Set(itc.lines.filter((l) => l.eligible).map((l) => `${l.invoice.partyGstin}|${l.invoice.number.trim().toUpperCase()}`));
  const r1 = gstr1(books.gstInvoices, gstin, period), r3 = gstr3b(books.gstInvoices, gstin, period, eligibleKeys);
  const due = owner ? obligations({ entity: owner, profile, fy, today: today(), gstFilings: books.gstFilings, fyRecords: books.fyRecords, rules: books.rules }).filter((o) => o.gstin === gstin) : [];
  const pay = matchGstPayments(months.map((m) => ({ period: m, amount: gstr3b(books.gstInvoices, gstin, m, new Set(itcReview(books.gstInvoices, gstin, m).lines.filter((l) => l.eligible).map((l) => `${l.invoice.partyGstin}|${l.invoice.number.trim().toUpperCase()}`))).netPayable })).filter((x) => x.amount > 0), transactions.filter((t) => (t.txnType ?? "expense") === "expense").map((t) => ({ id: t.id, date: t.date, amount: t.amount, accountId: t.accountId, text: `${t.title} ${t.merchant ?? ""} ${t.description}` })), { gstin, accountIds: owner ? new Set(books.entityAccounts?.[owner.id] ?? []) : undefined });
  const g9 = gstr9(books.gstInvoices, gstin, Number(fy.slice(0, 4)), eligibleKeys);
  const yr = annualSummary(books.gstInvoices, gstin, Number(fy.slice(0, 4)));
  const unfiled: { form: string; period: string; due?: string; status?: string }[] = profile ? due.filter((o) => o.status === "overdue" || o.status === "due") : unfiledPeriods(books.gstFilings, gstin, "GSTR-3B", months).map((m) => ({ form: "GSTR-3B", period: m }));
  const list = books.gstInvoices.filter((i) => i.gstin === gstin && i.date.startsWith(period));
  const dups = duplicateInvoices(books.gstInvoices.filter((i) => i.gstin === gstin));
  const n = (v: string) => Math.max(0, Number(v) || 0);
  return (
    <Fold id="gst" title="GST returns (drafts)" hint={profile ? `${unfiled.length} return${unfiled.length === 1 ? "" : "s"} due or overdue · ${profile.gstScheme === "qrmp" ? "quarterly (QRMP)" : profile.gstScheme === "composition" ? "composition" : profile.gstScheme === "regular" ? "monthly" : "not registered"}` : "Set the filing scheme in the tax profile"}>
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-2">
          <select aria-label="GSTIN" className="rounded-md border bg-background px-2 py-1" value={gstin} onChange={(e) => setGstin(e.target.value)}>{gstins.map((x) => <option key={x.g} value={x.g}>{x.name} · {x.g}</option>)}</select>
          <select aria-label="Month" className="rounded-md border bg-background px-2 py-1" value={period} onChange={(e) => setPeriod(e.target.value)}>{months.map((m) => <option key={m}>{m}</option>)}</select>
          <Link to="/statements" search={{ context: "gst" }} className="rounded-md border px-2 py-1 text-primary">Upload invoice or return</Link>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border p-3 text-xs"><p className="font-semibold">GSTR-1 draft · {period}</p><p>B2B: {r1.b2b.count} invoices · taxable {inr(r1.b2b.taxable)} · tax {inr(r1.b2b.igst + r1.b2b.cgst + r1.b2b.sgst + r1.b2b.cess)}</p><p>B2C: {r1.b2c.count} invoices · taxable {inr(r1.b2c.taxable)}</p></div>
          <div className="rounded-xl border p-3 text-xs"><p className="font-semibold">GSTR-3B draft · {period}</p><p>Output tax {inr(r3.outputTax)} · ITC {inr(r3.itcClaimed)}</p><p className="font-semibold">Net payable {inr(r3.netPayable)}{r3.carryForward ? ` · credit carried ${inr(r3.carryForward)}` : ""}</p></div>
        </div>
        {!profile && <p className="text-xs text-destructive">No filing scheme recorded for this GSTIN — set it in the tax profile above so monthly or quarterly returns are worked out correctly.</p>}
        {itc.lines.length > 0 && <details><summary className="cursor-pointer text-xs text-muted-foreground">Input tax credit review · {inr(itc.eligible)} claimable · {inr(itc.held)} held</summary>
          {itc.lines.map((l) => <p key={l.invoice.id} className="break-words text-xs">{l.invoice.number} · {l.invoice.party} · {inr(l.tax)} — {l.eligible ? <span className="text-primary">claimable</span> : <span className="text-destructive">held: {l.reasons.join(", ")}</span>}</p>)}</details>}
        {unfiled.length > 0 && <div className="text-xs"><b>Returns due</b>{unfiled.slice(0, 12).map((o) => <p key={`${o.form}${o.period}`}>{o.form} {o.period}{o.due ? ` · due ${o.due}${o.status === "overdue" ? " (overdue)" : ""}` : ""}</p>)}</div>}
        <p className="text-[11px] text-muted-foreground">ITC in the 3B draft counts only purchases with a valid supplier GSTIN and a clean tax split; confirm against the supplier-filed GSTR-2B on <Link to="/gst-check" className="underline">Suppliers & invoices</Link> before filing. Annual FY {fy}: sales {inr(yr.sales)}, output tax {inr(yr.outputTax)}, purchases {inr(yr.purchases)}, input tax {inr(yr.inputTax)}.</p>
        <div className="rounded-xl border p-3 text-xs"><p className="font-semibold">GSTR-9 working · FY {fy}</p><p>Table 4 outward: taxable {inr(g9.table4.taxable)} · tax {inr(g9.table4.tax)}</p><p>Table 6 ITC availed: {inr(g9.table6.itc)}</p><p>Table 9 tax payable {inr(g9.table9.payable)} · per monthly 3B {inr(g9.table9.paidThrough3B)}</p>{g9.checks.map((c) => <p key={c} className="text-destructive">{c}</p>)}
          <Button size="sm" variant="outline" className="mt-2" onClick={() => save({ savedDrafts: [...(books.savedDrafts ?? []).filter((d) => !(d.form === "GSTR-9" && d.period === fy && d.ref === gstin)), { id: crypto.randomUUID(), form: "GSTR-9", period: fy, ref: gstin, createdAt: new Date().toISOString(), data: g9 }, ...[{ form: "GSTR-1", data: r1 }, { form: "GSTR-3B", data: r3 }].map((x) => ({ id: crypto.randomUUID(), form: x.form, period, ref: gstin, createdAt: new Date().toISOString(), data: x.data }))].filter((d, i, all) => all.findIndex((o) => o.form === d.form && o.period === d.period && o.ref === d.ref) === i) })}>Save drafts for review</Button></div>
        {pay.length > 0 && <div className="text-xs"><b>GST payments</b>{pay.map((p) => <p key={p.period}>{p.period}: {inr(p.amount)} — {p.paymentId ? `paid ${p.paidOn}` : <span className="text-destructive">no matching payment found</span>}</p>)}</div>}
        <details><summary className="cursor-pointer text-muted-foreground">Invoice register · {list.length} in {period}{dups.length ? ` · ${dups.length} duplicate number${dups.length > 1 ? "s" : ""}` : ""}</summary>
          {list.map((i) => <div key={i.id} className="flex justify-between gap-2 border-b py-1 text-xs"><span>{i.kind === "sales" ? "Sale" : "Purchase"} {i.number} · {i.party} {i.partyGstin}<span className="block text-destructive">{invoiceProblems(i).join(" · ")}</span></span><span>{inr(i.taxable)} + {inr(i.igst + i.cgst + i.sgst + i.cess)}<Button size="sm" variant="ghost" className="h-6" onClick={() => save({ gstInvoices: books.gstInvoices.filter((x) => x.id !== i.id) })}>Remove</Button></span></div>)}
          {!inv && <Button size="sm" variant="outline" className="mt-2" onClick={() => setInv(blankInv(gstin))}>Add invoice</Button>}
          {inv && <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <select aria-label="Invoice kind" className="rounded-md border bg-background px-1" value={inv.kind} onChange={(e) => setInv({ ...inv, kind: e.target.value as "sales" })}><option value="sales">Sale</option><option value="purchase">Purchase</option></select>
            <Input aria-label="Invoice number" placeholder="Number" value={inv.number} onChange={(e) => setInv({ ...inv, number: e.target.value })} />
            <Input aria-label="Invoice date" type="date" value={inv.date} onChange={(e) => setInv({ ...inv, date: e.target.value })} />
            <Input aria-label="Party" placeholder="Party" value={inv.party} onChange={(e) => setInv({ ...inv, party: e.target.value })} />
            <Input aria-label="Party GSTIN" className="col-span-2" placeholder="Party GSTIN (blank for B2C)" value={inv.partyGstin} onChange={(e) => setInv({ ...inv, partyGstin: e.target.value.toUpperCase().trim() })} />
            {(["taxable", "igst", "cgst", "sgst", "cess"] as const).map((k) => <label key={k}>{k.toUpperCase()}<Input type="number" value={inv[k] || ""} onChange={(e) => setInv({ ...inv, [k]: n(e.target.value) })} /></label>)}
            <div className="col-span-2 flex gap-2"><Button size="sm" disabled={!inv.number.trim() || !(inv.taxable > 0)} onClick={async () => { await save({ gstInvoices: [...books.gstInvoices, inv] }); setInv(null); }}>Save invoice</Button><Button size="sm" variant="ghost" onClick={() => setInv(null)}>Cancel</Button></div>
          </div>}
        </details>
        <details><summary className="cursor-pointer text-muted-foreground">Filing evidence · {books.gstFilings.filter((f) => f.gstin === gstin).length} recorded</summary>
          {books.gstFilings.filter((f) => f.gstin === gstin).map((f) => <p key={f.id} className="text-xs">{f.form} {f.period} filed {f.filedOn} · ARN {f.arn}</p>)}
          <div className="mt-2 flex flex-wrap gap-1 text-xs"><select aria-label="Form" className="rounded-md border bg-background px-1" value={filing.form} onChange={(e) => setFiling({ ...filing, form: e.target.value })}>{["GSTR-1", "GSTR-3B", "GSTR-9", "CMP-08"].map((f) => <option key={f}>{f}</option>)}</select>
            <Input aria-label="ARN" className="h-8 w-40" placeholder="ARN" value={filing.arn} onChange={(e) => setFiling({ ...filing, arn: e.target.value })} />
            <Input aria-label="Filed on" className="h-8 w-36" type="date" value={filing.filedOn} onChange={(e) => setFiling({ ...filing, filedOn: e.target.value })} />
            <Button size="sm" variant="outline" disabled={filing.arn.trim().length < 6} onClick={() => save({ gstFilings: [...books.gstFilings, { id: crypto.randomUUID(), gstin, period, ...filing }] })}>Record filing for {period}</Button></div>
          <p className="mt-1 text-[11px] text-muted-foreground">Ledgerline never files returns. File on the GST portal, then record the ARN here as evidence.</p>
        </details>
      </div>
    </Fold>
  );
}

interface DetectedChange { id: string; url: string; summary: string; detected_at: string; proposals: unknown }
/** Changes the weekly watch found on official pages, waiting for the owner to record or dismiss [§49–51]. */
function useDetectedChanges() {
  const [v, setV] = useState<{ changes: DetectedChange[]; job: { status: string; last_success: string | null; reason: string | null } | null }>({ changes: [], job: null });
  useEffect(() => {
    let live = true;
    void Promise.all([
      supabase.from("regulatory_changes").select("id,url,summary,detected_at,proposals").order("detected_at", { ascending: false }).limit(30),
      supabase.from("job_state").select("status,last_success,reason").eq("name", "rule-watch").maybeSingle(),
    ]).then(([c, j]) => { if (live) setV({ changes: (c.data ?? []) as DetectedChange[], job: j.data ?? null }); }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  return v;
}

export function RulesRegister() {
  const { books, save, preferences } = useBooks();
  const detected = useDetectedChanges();
  const decided = new Set((books.ruleDecisions ?? []).map((x) => x.changeId));
  const open = detected.changes.filter((c) => !decided.has(c.id));
  const decide = (id: string, status: "approved" | "dismissed") => save({ ruleDecisions: [...(books.ruleDecisions ?? []), { changeId: id, status, at: new Date().toISOString() }] });
  const [d, setD] = useState({ area: "income_tax" as RuleArea, key: "", title: "", value: "", sourceUrl: "", publishedOn: today(), effectiveFrom: today(), ambiguity: "", appliesTo: [] as string[] });
  const proposed = books.rules.filter((r) => r.status === "proposed");
  return (
    <Fold id="rules" title="Regulatory intelligence" hint={`${books.rules.filter((r) => r.status === "active").length} active · ${proposed.length} waiting for approval`}>
      <div className="space-y-3 text-sm">
        <div className="text-xs"><b>Official sources watched (read-only)</b>{OFFICIAL_SOURCES.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="block text-primary underline">{s.name}</a>)}</div>
        <p className="text-[11px] text-muted-foreground">Checked weekly: {detected.job?.last_success ? `last ${detected.job.last_success.slice(0, 10)}` : "not run yet"}{detected.job?.reason ? ` · ${detected.job.reason}` : ""}</p>
        {open.map((c) => <div key={c.id} className="rounded-xl border border-primary/40 p-3 text-xs">
          <p className="font-semibold">{c.summary} <span className="font-normal text-muted-foreground">· found {c.detected_at.slice(0, 10)}</span></p>
          <ul className="ml-4 list-disc">{(Array.isArray(c.proposals) ? (c.proposals as string[]) : []).slice(0, 8).map((x) => <li key={x}>{x}</li>)}</ul>
          <div className="mt-1 flex flex-wrap gap-1"><a href={c.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">Open official page</a>
            <Button size="sm" variant="outline" className="h-7" onClick={() => { setD({ ...d, sourceUrl: c.url, title: (Array.isArray(c.proposals) ? String((c.proposals as string[])[0] ?? "") : "").slice(0, 120) }); void decide(c.id, "approved"); toast.message("Fill in the rule key, value and effective date below, then add it as a proposal"); }}>Record as rule change</Button>
            <Button size="sm" variant="ghost" className="h-7" onClick={() => void decide(c.id, "dismissed")}>Not relevant</Button></div>
        </div>)}
        <p className="text-[11px] text-muted-foreground">A change is recorded as a proposal with its source and effective date, checked, and only applies after you approve it. Earlier years keep the rule that applied then; filed returns and closed years are never changed.</p>
        {books.rules.slice().reverse().map((r) => { const prev = ruleOn(books.rules.filter((x) => x.id !== r.id), r.key, r.effectiveFrom); const tests = validateRule(r); return <div key={r.id} className="rounded-xl border p-3 text-xs">
          <p className="font-semibold">{r.title} <span className={`ml-1 rounded-full px-2 ${r.status === "active" ? "bg-primary/10 text-primary" : "bg-secondary"}`}>{r.status}</span></p>
          <p>{r.key}: <b>{r.value}</b> from {r.effectiveFrom}{r.effectiveTo ? ` to ${r.effectiveTo}` : ""}{prev ? ` (was ${prev.value})` : ""}</p>
          <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">Source</a> · published {r.publishedOn}
          {r.status === "proposed" && (() => { const imp = ruleImpact(r, { entities: preferences.entities ?? [], closedPeriods: books.closedPeriods, fyRecords: books.fyRecords, gstFilings: books.gstFilings, today: today() }); return <div className="mt-1 rounded-lg bg-secondary/50 p-2">
            <p>Affects: {imp.entities.length ? imp.entities.map((e) => e.name).join(", ") : "no saved company or person yet"} · FY {imp.years.join(", ")}</p>
            {imp.protectedYears.map((y) => <p key={y.fy} className="text-destructive">FY {y.fy} keeps its earlier treatment ({y.why.join(", ")}) — nothing there is changed.</p>)}
          </div>; })()}
          {r.status === "proposed" && <><ul className="mt-1">{tests.map((t) => <li key={t.name} className={t.passed ? "" : "text-destructive"}>{t.passed ? "✓" : "✗"} {t.name}</li>)}</ul>
            <div className="mt-1 flex gap-1"><Button size="sm" disabled={tests.some((t) => !t.passed)} onClick={async () => { const imp = ruleImpact(r, { entities: preferences.entities ?? [], closedPeriods: books.closedPeriods, fyRecords: books.fyRecords, gstFilings: books.gstFilings, today: today() }); if (imp.protectedYears.length && !window.confirm(`This rule reaches back into ${imp.protectedYears.map((y) => `FY ${y.fy}`).join(", ")}, which ${imp.protectedYears.length > 1 ? "are" : "is"} closed or filed. Those years will keep their earlier treatment. Approve for the open periods only?`)) return; try { await save({ rules: activateRule(books.rules, r.id, today()) }); toast.success("Rule approved and active from its effective date"); } catch (e) { toast.error((e as Error).message); } }}>Approve</Button>
              <Button size="sm" variant="ghost" onClick={() => save({ rules: books.rules.map((x) => (x.id === r.id ? { ...x, status: "rejected" } : x)) })}>Reject</Button></div></>}
        </div>; })}
        <details open={Boolean(d.sourceUrl) || undefined}><summary className="cursor-pointer text-muted-foreground">Record a rule change</summary>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <select aria-label="Area" className="rounded-md border bg-background px-1" value={d.area} onChange={(e) => setD({ ...d, area: e.target.value as RuleArea })}>{["income_tax", "gst", "corporate", "depreciation", "return_format", "due_date", "property"].map((a) => <option key={a} value={a}>{a.replace("_", " ")}</option>)}</select>
            <Input aria-label="Rule key" placeholder="Key, e.g. gstr3b.due" value={d.key} onChange={(e) => setD({ ...d, key: e.target.value.trim() })} />
            <Input aria-label="Title" className="col-span-2" placeholder="Title" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} />
            <Input aria-label="New value" className="col-span-2" placeholder="New value as published" value={d.value} onChange={(e) => setD({ ...d, value: e.target.value })} />
            <Input aria-label="Official source URL" className="col-span-2" placeholder="https://…gov.in/…" value={d.sourceUrl} onChange={(e) => setD({ ...d, sourceUrl: e.target.value.trim() })} />
            <label>Published<Input type="date" value={d.publishedOn} onChange={(e) => setD({ ...d, publishedOn: e.target.value })} /></label>
            <label>Effective from<Input type="date" value={d.effectiveFrom} onChange={(e) => setD({ ...d, effectiveFrom: e.target.value })} /></label>
            {(preferences.entities ?? []).length > 0 && <div className="col-span-2"><p className="text-muted-foreground">Applies to (leave all unticked to decide by rule area)</p><div className="flex flex-wrap gap-2">{(preferences.entities ?? []).map((e) => <label key={e.id} className="flex items-center gap-1"><input type="checkbox" checked={d.appliesTo.includes(e.id)} onChange={(x) => setD({ ...d, appliesTo: x.target.checked ? [...d.appliesTo, e.id] : d.appliesTo.filter((i) => i !== e.id) })} />{e.name}</label>)}</div></div>}
            <p className="col-span-2 text-[11px] text-muted-foreground">Due-date extension for one period: key <code>due.FORM.PERIOD</code> (e.g. due.GSTR-3B.2026-09 or due.ITR.2025-26) with the new date as the value. A lasting change: key <code>due.FORM</code> with the new day of the month. The filing calendar uses approved rules only.</p>
            <Input aria-label="Open question" className="col-span-2" placeholder="Anything unclear? (blocks approval until cleared)" value={d.ambiguity} onChange={(e) => setD({ ...d, ambiguity: e.target.value })} />
            <Button size="sm" className="col-span-2" disabled={!d.key || !d.title || !d.value} onClick={async () => { const r = proposeRule(books.rules, { id: crypto.randomUUID(), area: d.area, key: d.key, title: d.title, value: d.value, sourceUrl: d.sourceUrl, publishedOn: d.publishedOn, effectiveFrom: d.effectiveFrom, appliesTo: d.appliesTo, ...(d.ambiguity ? { ambiguity: d.ambiguity } : {}) }); if (r.duplicate) { toast.message("This rule version is already recorded"); return; } await save({ rules: r.rules }); toast.success("Recorded as a proposal"); }}>Add as proposal</Button>
          </div></details>
      </div>
    </Fold>
  );
}

export function TaxComputationCard({ fy }: { fy: string }) {
  const { books, save, preferences } = useBooks();
  const { transactions } = useStore();
  const demat = useDemat();
  const entities = preferences.entities ?? [];
  const [who, setWho] = useState<string>("");
  const [credit, setCredit] = useState({ kind: "tds" as CreditKind, amount: "", source: "" });
  const ent = entities.find((e) => e.id === who);
  const accountIds = ent ? new Set(books.entityAccounts?.[ent.id] ?? []) : null;
  const gains = ent ? [] : (demat ?? []).flatMap((d) => d.holdings.flatMap((h) => h.gains));
  const companyAccounts = new Set(Object.values(books.entityAccounts ?? {}).flat());
  const c = taxComputation(fy, transactions, preferences.assets ?? [], books.leases, gains, books.fyRecords, ent?.id, accountIds ? { accountIds } : undefined, ent ? undefined : { accountIds: companyAccounts }, (() => { const xs = (books.salaryEvidence ?? []).filter((x) => x.entityId === (ent?.id ?? "personal") && x.fy === fy); return xs.length ? xs.reduce((s, x) => s + x.amount, 0) : null; })());
  const profile = ent ? books.taxProfiles.find((p) => p.entityId === ent.id) : undefined;
  const { rules } = rulesFor(fy);
  const personal = !ent || ent.kind === "individual" || ent.kind === "huf";
  // A company/person needs a confirmed profile; "You (personal)" has no entity record and uses the new regime unless an individual profile exists.
  const regime = ent ? profile?.regime : "new";
  const unconfirmed = !!ent && !(profile?.regime && profile.gstScheme);
  const slabTax = !unconfirmed && personal && regime === "new" ? estimateTax(c.total - c.capitalGains.long - c.capitalGains.short, rules) : null;
  const creditKey = ent?.id ?? "personal";
  const cr = creditsFor(books.taxCredits ?? [], creditKey, fy);
  const recordedTx = new Set((books.taxCredits ?? []).map((x) => x.transactionId).filter(Boolean));
  const challans = ledgerTaxPayments(accountIds ? transactions.filter((t) => t.accountId && accountIds.has(t.accountId)) : transactions, fy).filter((t) => !recordedTx.has(t.id));
  const rows: [string, number][] = [["Salary", c.salary], ["House property (rent − 30% − interest, loss capped ₹2L)", c.houseProperty.net], ["Business / profession", c.business.net], ["Short-term capital gains", c.capitalGains.short], ["Long-term capital gains", c.capitalGains.long], ["Other sources (interest, dividends)", c.otherSources], ["Gross total income", c.gross], ["Losses brought forward set off", -c.lossesSetOff], ["Total income", c.total]];
  const addCredit = (x: { kind: CreditKind; amount: number; source: string; transactionId?: string }) => save({ taxCredits: [...(books.taxCredits ?? []), { id: crypto.randomUUID(), entityId: creditKey, fy, ...x }] });
  return (
    <Fold title="Tax computation by head" hint={`FY ${fy} · ${ent?.name ?? "You (personal)"} · total income ${inr(c.total)}`}>
      <div className="space-y-2 text-sm">
        {entities.length > 0 && <select aria-label="Whose tax" className="w-full rounded-md border bg-background px-2 py-1 text-sm" value={who} onChange={(e) => setWho(e.target.value)}><option value="">You (personal)</option>{entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>}
        {ent && accountIds && accountIds.size === 0 && <p className="text-xs text-destructive">No accounts are linked to {ent.name} yet — link them in its tax profile below. Until then nothing is counted for it.</p>}
        {unconfirmed && <p className="text-xs text-destructive">Confirm {ent!.name}'s tax profile (regime and GST scheme) below before this working is used.</p>}
        <div className="divide-y rounded-xl border">{rows.map(([k, v]) => <div key={k} className="flex justify-between gap-2 px-3 py-2 text-xs"><span>{k}</span><b className="shrink-0">{inr(v)}</b></div>)}</div>
        {slabTax != null ? <p className="text-xs">Indicative slab tax (new regime): <b>{inr(slabTax)}</b> plus capital-gains tax at special rates.</p>
          : <p className="text-xs text-muted-foreground">{personal ? "Old-regime slabs and deductions are not added — no tax figure is shown rather than a guess." : `${ent ? ENTITY_KINDS[ent.kind].label : ""} tax rates depend on the option chosen (e.g. section 115BAA/115BAB) — the accountant confirms the rate; no tax figure is shown.`}</p>}
        <div className="rounded-xl border p-3 text-xs">
          <p className="font-semibold">Taxes already paid · {inr(cr.total)}</p>
          {cr.lines.map((l) => <p key={l.id} className="flex justify-between gap-2"><span className="break-words">{CREDIT_LABEL[l.kind]} · {l.source}</span><span className="shrink-0">{inr(l.amount)}<Button size="sm" variant="ghost" className="h-6" onClick={() => save({ taxCredits: (books.taxCredits ?? []).filter((x) => x.id !== l.id) })}>Remove</Button></span></p>)}
          {slabTax != null && cr.total > 0 && <p className="mt-1 font-semibold">{slabTax - cr.total >= 0 ? `Balance still to pay about ${inr(slabTax - cr.total)}` : `Refund due about ${inr(cr.total - slabTax)}`} (before capital-gains tax)</p>}
          {challans.map((t) => <p key={t.id} className="mt-1 flex items-center justify-between gap-2"><span className="break-words">Bank debit {t.date}: {t.text.slice(0, 60)} · {inr(t.amount)}</span><Button size="sm" variant="outline" className="h-7 shrink-0" onClick={() => addCredit({ kind: t.kind, amount: t.amount, source: `Bank debit ${t.date}`, transactionId: t.id })}>Count as {t.kind === "self_assessment" ? "self-assessment" : "advance"} tax</Button></p>)}
          <div className="mt-2 flex flex-wrap gap-1"><select aria-label="Credit type" className="rounded-md border bg-background px-1" value={credit.kind} onChange={(e) => setCredit({ ...credit, kind: e.target.value as CreditKind })}>{(Object.keys(CREDIT_LABEL) as CreditKind[]).map((k) => <option key={k} value={k}>{CREDIT_LABEL[k]}</option>)}</select>
            <Input aria-label="Credit amount" className="h-8 w-28" type="number" placeholder="Amount" value={credit.amount} onChange={(e) => setCredit({ ...credit, amount: e.target.value })} />
            <Input aria-label="Credit source" className="h-8 min-w-0 flex-1" placeholder="Source, e.g. Form 26AS / Form 16 from employer" value={credit.source} onChange={(e) => setCredit({ ...credit, source: e.target.value })} />
            <Button size="sm" variant="outline" disabled={!(Number(credit.amount) > 0) || credit.source.trim().length < 3} onClick={async () => { await addCredit({ kind: credit.kind, amount: Number(credit.amount), source: credit.source.trim() }); setCredit({ ...credit, amount: "", source: "" }); }}>Add</Button></div>
          <p className="mt-1 text-[11px] text-muted-foreground">Only credits you can see on Form 26AS, Form 16/16A, AIS or a paid challan. Upload them on <Link to="/statements" search={{ context: "tax" }} className="underline">Statement Desk</Link> to keep the original.</p>
        </div>
        {c.notes.map((n) => <p key={n} className="text-[11px] text-muted-foreground">{n}</p>)}
      </div>
    </Fold>
  );
}

/** Every filing obligation with its due date and evidence, per entity [§45, §48]. */
export function FilingCalendar({ fy }: { fy: string }) {
  const { books, preferences } = useBooks();
  const entities = preferences.entities ?? [];
  const list = entities.flatMap((e) => obligations({ entity: e, profile: books.taxProfiles.find((p) => p.entityId === e.id), fy, today: today(), gstFilings: books.gstFilings, fyRecords: books.fyRecords, rules: books.rules }).map((o) => ({ ...o, name: e.name })));
  const missing = entities.filter((e) => !books.taxProfiles.some((p) => p.entityId === e.id));
  const overdue = list.filter((o) => o.status === "overdue").length;
  const tone = { filed: "text-primary", overdue: "text-destructive", due: "font-semibold", upcoming: "text-muted-foreground" } as const;
  return (
    <Fold id="calendar" title="Filing calendar" hint={`FY ${fy} · ${list.filter((o) => o.status === "filed").length}/${list.length} with filing evidence${overdue ? ` · ${overdue} overdue` : ""}`}>
      <div className="space-y-1 text-xs">
        {missing.length > 0 && <p className="text-destructive">Set a tax profile for {missing.map((e) => e.name).join(", ")} to see its returns.</p>}
        {list.length === 0 && missing.length === 0 && <p className="text-muted-foreground">Add a company or person on Companies & years to see its returns.</p>}
        {list.map((o) => <div key={`${o.entityId}${o.gstin}${o.form}${o.period}`} className="flex items-start justify-between gap-2 border-b py-1"><span className="min-w-0 break-words"><b>{o.form}</b> {o.period} · {o.name}{o.gstin ? ` · ${o.gstin}` : ""}<span className="block text-[11px] text-muted-foreground">{o.basis}</span></span><span className={`shrink-0 text-right ${tone[o.status]}`}>{o.status === "filed" ? o.evidence : `due ${o.due}`}<span className="block">{o.status}</span></span></div>)}
        <p className="text-[11px] text-muted-foreground">Drafts are prepared here; Ledgerline never files. After you or your accountant file, record the acknowledgement or ARN so the return shows as filed.</p>
      </div>
    </Fold>
  );
}
