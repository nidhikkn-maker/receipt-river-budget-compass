/** Tax & audit centre sections: past-year onboarding, tax profiles, GST returns and rule register (v6 §17–20, §45–51). */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Fold } from "@/components/Fold";
import { useStore } from "@/lib/store";
import { ENTITY_KINDS, fyRange } from "@/lib/entities";
import { accountBalance } from "@/lib/ledger";
import { HEAD_LABEL, confirmOpening, nextFy, openingProposal } from "@/lib/books/fy";
import { REQUIRED_SCHEDULES } from "@/lib/books/intake";
import { annualSummary, duplicateInvoices, gstr1, gstr3b, invoiceProblems, matchGstPayments, unfiledPeriods } from "@/lib/books/gst";
import { activateRule, OFFICIAL_SOURCES, proposeRule, ruleOn, validateRule, formFor } from "@/lib/books/regulatory";
import type { GstInvoice, OpeningHead, RuleArea, TaxProfile } from "@/lib/books/types";
import { useBooks } from "./useBooks";

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
          const bookNow: Partial<Record<OpeningHead, number>> = r.confirmedOpening ? {} : {
            bank: Math.round(accounts.filter((a) => ["savings", "current"].includes(a.kind) && !a.archived).reduce((s, a) => s + accountBalance(a, transactions.filter((t) => t.date <= fyRange(r.fy).end)), 0)),
          };
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
  const entities = preferences.entities ?? [];
  const upd = (p: TaxProfile) => save({ taxProfiles: [...books.taxProfiles.filter((x) => x.entityId !== p.entityId), p] });
  return (
    <Fold title="Tax profile per company or person" hint={`${books.taxProfiles.length}/${entities.length} set`}>
      <div className="space-y-2 text-sm">
        {entities.length === 0 && <p className="text-muted-foreground">Add a company or person first on <Link to="/entities" className="underline">Companies & years</Link>.</p>}
        {entities.map((e) => {
          const p = books.taxProfiles.find((x) => x.entityId === e.id) ?? { entityId: e.id, regime: "new", obligations: [], gstScheme: e.gstins.length ? "regular" : "none", auditRequired: e.kind === "company" || e.kind === "llp" } as TaxProfile;
          const f = formFor(e.kind, e.kind !== "individual", fy);
          return <div key={e.id} className="rounded-xl border p-3">
            <p className="font-semibold">{e.name} <span className="text-xs font-normal text-muted-foreground">{ENTITY_KINDS[e.kind].label}</span></p>
            <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
              <label>Regime<select className="w-full rounded-md border bg-background px-1 py-1" value={p.regime} onChange={(x) => upd({ ...p, regime: x.target.value as "new" })}><option value="new">New</option><option value="old">Old</option></select></label>
              <label>GST scheme<select className="w-full rounded-md border bg-background px-1 py-1" value={p.gstScheme} onChange={(x) => upd({ ...p, gstScheme: x.target.value as "regular" })}><option value="none">Not registered</option><option value="regular">Regular (monthly)</option><option value="qrmp">QRMP (quarterly)</option><option value="composition">Composition</option></select></label>
              <label className="col-span-2 flex items-center gap-2"><input type="checkbox" checked={p.auditRequired} onChange={(x) => upd({ ...p, auditRequired: x.target.checked })} />Accounts audited</label>
            </div>
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
  const r1 = gstr1(books.gstInvoices, gstin, period), r3 = gstr3b(books.gstInvoices, gstin, period);
  const pay = matchGstPayments(months.map((m) => ({ period: m, amount: gstr3b(books.gstInvoices, gstin, m).netPayable })).filter((x) => x.amount > 0), transactions.filter((t) => (t.txnType ?? "expense") === "expense").map((t) => ({ id: t.id, date: t.date, amount: t.amount, text: `${t.title} ${t.merchant ?? ""} ${t.description}` })));
  const yr = annualSummary(books.gstInvoices, gstin, Number(fy.slice(0, 4)));
  const unfiled = unfiledPeriods(books.gstFilings, gstin, "GSTR-3B", months);
  const list = books.gstInvoices.filter((i) => i.gstin === gstin && i.date.startsWith(period));
  const dups = duplicateInvoices(books.gstInvoices.filter((i) => i.gstin === gstin));
  const n = (v: string) => Math.max(0, Number(v) || 0);
  return (
    <Fold id="gst" title="GST returns (drafts)" hint={`${unfiled.length} month${unfiled.length === 1 ? "" : "s"} without filing evidence`}>
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
        <p className="text-[11px] text-muted-foreground">ITC here uses every purchase invoice entered; check it against GSTR-2B on <Link to="/gst-check" className="underline">Suppliers & invoices</Link> before filing. Annual FY {fy}: sales {inr(yr.sales)}, output tax {inr(yr.outputTax)}, purchases {inr(yr.purchases)}, input tax {inr(yr.inputTax)}.</p>
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

export function RulesRegister() {
  const { books, save } = useBooks();
  const [d, setD] = useState({ area: "income_tax" as RuleArea, key: "", title: "", value: "", sourceUrl: "", publishedOn: today(), effectiveFrom: today(), ambiguity: "" });
  const proposed = books.rules.filter((r) => r.status === "proposed");
  return (
    <Fold id="rules" title="Regulatory intelligence" hint={`${books.rules.filter((r) => r.status === "active").length} active · ${proposed.length} waiting for approval`}>
      <div className="space-y-3 text-sm">
        <div className="text-xs"><b>Official sources watched (read-only)</b>{OFFICIAL_SOURCES.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="block text-primary underline">{s.name}</a>)}</div>
        <p className="text-[11px] text-muted-foreground">A change is recorded as a proposal with its source and effective date, checked, and only applies after you approve it. Earlier years keep the rule that applied then; filed returns and closed years are never changed.</p>
        {books.rules.slice().reverse().map((r) => { const prev = ruleOn(books.rules.filter((x) => x.id !== r.id), r.key, r.effectiveFrom); const tests = validateRule(r); return <div key={r.id} className="rounded-xl border p-3 text-xs">
          <p className="font-semibold">{r.title} <span className={`ml-1 rounded-full px-2 ${r.status === "active" ? "bg-primary/10 text-primary" : "bg-secondary"}`}>{r.status}</span></p>
          <p>{r.key}: <b>{r.value}</b> from {r.effectiveFrom}{r.effectiveTo ? ` to ${r.effectiveTo}` : ""}{prev ? ` (was ${prev.value})` : ""}</p>
          <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">Source</a> · published {r.publishedOn}
          {r.status === "proposed" && <><ul className="mt-1">{tests.map((t) => <li key={t.name} className={t.passed ? "" : "text-destructive"}>{t.passed ? "✓" : "✗"} {t.name}</li>)}</ul>
            <div className="mt-1 flex gap-1"><Button size="sm" disabled={tests.some((t) => !t.passed)} onClick={async () => { try { await save({ rules: activateRule(books.rules, r.id, today()) }); toast.success("Rule approved and active from its effective date"); } catch (e) { toast.error((e as Error).message); } }}>Approve</Button>
              <Button size="sm" variant="ghost" onClick={() => save({ rules: books.rules.map((x) => (x.id === r.id ? { ...x, status: "rejected" } : x)) })}>Reject</Button></div></>}
        </div>; })}
        <details><summary className="cursor-pointer text-muted-foreground">Record a rule change</summary>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <select aria-label="Area" className="rounded-md border bg-background px-1" value={d.area} onChange={(e) => setD({ ...d, area: e.target.value as RuleArea })}>{["income_tax", "gst", "corporate", "depreciation", "return_format", "due_date", "property"].map((a) => <option key={a} value={a}>{a.replace("_", " ")}</option>)}</select>
            <Input aria-label="Rule key" placeholder="Key, e.g. gstr3b.due" value={d.key} onChange={(e) => setD({ ...d, key: e.target.value.trim() })} />
            <Input aria-label="Title" className="col-span-2" placeholder="Title" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} />
            <Input aria-label="New value" className="col-span-2" placeholder="New value as published" value={d.value} onChange={(e) => setD({ ...d, value: e.target.value })} />
            <Input aria-label="Official source URL" className="col-span-2" placeholder="https://…gov.in/…" value={d.sourceUrl} onChange={(e) => setD({ ...d, sourceUrl: e.target.value.trim() })} />
            <label>Published<Input type="date" value={d.publishedOn} onChange={(e) => setD({ ...d, publishedOn: e.target.value })} /></label>
            <label>Effective from<Input type="date" value={d.effectiveFrom} onChange={(e) => setD({ ...d, effectiveFrom: e.target.value })} /></label>
            <Input aria-label="Open question" className="col-span-2" placeholder="Anything unclear? (blocks approval until cleared)" value={d.ambiguity} onChange={(e) => setD({ ...d, ambiguity: e.target.value })} />
            <Button size="sm" className="col-span-2" disabled={!d.key || !d.title || !d.value} onClick={async () => { const r = proposeRule(books.rules, { id: crypto.randomUUID(), area: d.area, key: d.key, title: d.title, value: d.value, sourceUrl: d.sourceUrl, publishedOn: d.publishedOn, effectiveFrom: d.effectiveFrom, appliesTo: [], ...(d.ambiguity ? { ambiguity: d.ambiguity } : {}) }); if (r.duplicate) { toast.message("This rule version is already recorded"); return; } await save({ rules: r.rules }); toast.success("Recorded as a proposal"); }}>Add as proposal</Button>
          </div></details>
      </div>
    </Fold>
  );
}
