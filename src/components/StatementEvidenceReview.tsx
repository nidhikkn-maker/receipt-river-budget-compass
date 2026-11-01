import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import type { ImportBatch } from "@/lib/historical-import";
import { identityCandidates, type StatementReview } from "@/lib/statement-evidence";
import { saveStatementEvidence, runStatementCheckpoint, copyStatementToAccount } from "@/lib/statement-checkpoint.functions";
import { isLiability } from "@/lib/ledger";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Checkbox } from "./ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";

export function StatementEvidenceReview({ batch, onReload }: { batch: ImportBatch; onReload: () => Promise<void> }) {
  const { accounts } = useStore(), account = accounts.find(a => a.id === batch.account_id);
  const stored = batch.statement_review;
  const extracted = batch.statement_identity?.find(i => i.identifier) ?? batch.statement_identity?.[0];
  const [bank, setBank] = useState(stored?.identity?.bank ?? extracted?.bank ?? "");
  const [identifier, setIdentifier] = useState(stored?.identity?.identifier ?? extracted?.identifier ?? "");
  const [reference, setReference] = useState(stored?.identity?.reference ?? "");
  const [confirmed, setConfirmed] = useState(false), [manual, setManual] = useState(false);
  const [from, setFrom] = useState(stored?.coverage?.from ?? batch.period_from ?? ""), [to, setTo] = useState(stored?.coverage?.to ?? batch.period_to ?? "");
  const [coverageReference, setCoverageReference] = useState(stored?.coverage?.reference ?? ""), [coverageConfirmed, setCoverageConfirmed] = useState(false);
  const [convention, setConvention] = useState<"asset" | "liability">(stored?.convention ?? (account && isLiability(account.kind) ? "liability" : "asset"));
  const [preview, setPreview] = useState<StatementReview | null>(null), [checkResult, setCheckResult] = useState<string>("");
  const [copyAccount,setCopyAccount]=useState(''),[copyPreview,setCopyPreview]=useState(false);
  const checkId = useRef<string | null>(null);
  const save = useServerFn(saveStatementEvidence), check = useServerFn(runStatementCheckpoint), copy=useServerFn(copyStatementToAccount);
  const candidates = identityCandidates({ bank, identifier: identifier || null, quote: reference, page: null }, accounts);
  const mismatch = candidates.length > 0 && !candidates.some(a => a.id === batch.account_id);
  const reset = () => { setConfirmed(false); setCoverageConfirmed(false); };
  useEffect(() => { setBank(stored?.identity?.bank ?? extracted?.bank ?? ""); setIdentifier(stored?.identity?.identifier ?? extracted?.identifier ?? ""); reset(); }, [batch.id, JSON.stringify(batch.statement_identity)]);
  const openPreview = () => {
    if (!confirmed || !reference.trim() || (!identifier.trim() && !manual)) throw Error("Confirm the original statement account and supply a source reference.");
    if (mismatch) throw Error("This identifier belongs to a different account. Use the correct-account copy action; existing records stay unchanged.");
    setPreview({ identity: { bank, identifier, reference, confirmed, missingIdentifierConfirmed: manual, accountId: batch.account_id, reviewedAt: "" }, ...(coverageConfirmed ? { coverage: { from, to, reference: coverageReference, confirmed: true, reviewedAt: "" } } : stored?.coverage ? { coverage: stored.coverage } : {}), convention });
  };
  return <section aria-label="Statement identity and coverage" className="space-y-4 border-y py-5">
    <div><h3 className="text-lg font-semibold">Statement account & coverage</h3><p className="text-sm text-muted-foreground">Selected account: {account?.name ?? "Unavailable"}</p></div>
    {!!batch.statement_identity?.length && <ul className="space-y-2 text-xs text-muted-foreground">{batch.statement_identity.map((i, index) => <li key={index} className="break-words">Source page {i.page ?? "unknown"} · {i.bank ?? "Bank unknown"} · {i.identifier ?? "Identifier missing"}<br />{i.quote}</li>)}</ul>}
    <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs">Bank on original<Input aria-label="Statement bank" value={bank} onChange={e => { setBank(e.target.value); reset(); }} /></label><label className="text-xs">Account / masked card identifier<Input aria-label="Statement account identifier" value={identifier} onChange={e => { setIdentifier(e.target.value); reset(); }} /></label></div>
    <p className={`text-sm ${mismatch ? "text-destructive" : "text-muted-foreground"}`}>{mismatch ? `Different account matches: ${candidates.map(a => a.name).join(", ")}. This batch will not be reassigned or posted.` : candidates.length > 1 ? "Several accounts match; confirm the original manually." : candidates.length === 1 ? `Identifier candidate: ${candidates[0]?.name} · still requires confirmation` : "No reliable configured identifier match. Verify the account against the original."}</p>
    <details><summary className="cursor-pointer text-sm font-medium">Wrong account selected?</summary><div className="mt-3 space-y-3"><Select value={copyAccount} onValueChange={setCopyAccount}><SelectTrigger aria-label="Correct account for statement copy"><SelectValue placeholder="Choose correct account"/></SelectTrigger><SelectContent>{accounts.filter(a=>!a.archived&&a.id!==batch.account_id).map(a=><SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select><Button variant="outline" disabled={!copyAccount} onClick={()=>setCopyPreview(true)}>Preview correct-account copy</Button></div></details>
    <Input aria-label="Statement identity source reference" placeholder="Original page or bank record reference" value={reference} onChange={e => { setReference(e.target.value); reset(); }} />
    {!identifier.trim() && <label className="flex items-start gap-2 text-sm"><Checkbox aria-label="Confirm account despite missing identifier" checked={manual} onCheckedChange={v => setManual(v === true)} />The identifier is unavailable; I matched this account using the original bank record.</label>}
    <label className="flex items-start gap-2 text-sm"><Checkbox aria-label="Confirm statement account identity" checked={confirmed} onCheckedChange={v => setConfirmed(v === true)} />I confirmed that the original statement belongs to {account?.name ?? "this account"}.</label>
    <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs">Actual statement starts<Input type="date" aria-label="Confirmed coverage start" value={from} onChange={e => { setFrom(e.target.value); setCoverageConfirmed(false); }} /></label><label className="text-xs">Actual statement ends<Input type="date" aria-label="Confirmed coverage end" value={to} onChange={e => { setTo(e.target.value); setCoverageConfirmed(false); }} /></label></div>
    <Input aria-label="Statement coverage source reference" placeholder="Statement period source page / reference" value={coverageReference} onChange={e => { setCoverageReference(e.target.value); setCoverageConfirmed(false); }} />
    <label className="flex items-start gap-2 text-sm"><Checkbox aria-label="Confirm actual statement coverage" checked={coverageConfirmed} onCheckedChange={v => setCoverageConfirmed(v === true)} />I checked the full statement period against the original, not just its first and last transaction.</label>
    <Select value={convention} onValueChange={v => { setConvention(v as "asset" | "liability"); reset(); }}><SelectTrigger aria-label="Statement balance convention"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="asset">Money held · debits lower balance</SelectItem><SelectItem value="liability">Money owed · purchases increase balance</SelectItem></SelectContent></Select>
    <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={openPreview}>Preview statement confirmation</Button><Button variant="outline" onClick={async () => { checkId.current ??= crypto.randomUUID(); const r = await check({ data: { batch: batch.id, operation: checkId.current } }); checkId.current = null; setCheckResult(`${r.reconciliation} · Balance ${r.balance}${r.difference == null ? "" : ` · Difference ₹${r.difference}`}`); await onReload(); window.dispatchEvent(new Event("ledgerline:statement-updated")); toast.success("Reconciliation result recorded; no financial entries changed."); }}>Run & save reconciliation check</Button></div>
    {stored?.identity && <p className="text-xs text-muted-foreground">Account confirmed {stored.identity.reviewedAt.slice(0, 10)}{stored.coverage?.confirmed ? ` · Coverage through ${stored.coverage.to}` : " · Coverage not confirmed"}</p>}
    {checkResult && <p role="status" className="text-sm font-medium">{checkResult}</p>}
    <Dialog open={!!preview} onOpenChange={v => { if (!v) setPreview(null); }}><DialogContent><DialogHeader><DialogTitle>Confirm statement evidence</DialogTitle><DialogDescription>No ledger entries, opening balances or account assignments will change.</DialogDescription></DialogHeader><dl className="space-y-2 text-sm"><div><dt>Account</dt><dd>{account?.name}</dd></div><div><dt>Bank / identifier</dt><dd>{bank || "Unknown"} · {identifier || "Manually matched; identifier unavailable"}</dd></div><div><dt>Identity reference</dt><dd className="break-words">{reference}</dd></div><div><dt>Coverage</dt><dd>{preview?.coverage?.confirmed ? `${preview.coverage.from} through ${preview.coverage.to}` : "Not confirmed"}</dd></div><div><dt>Balance convention</dt><dd>{convention === "asset" ? "Money held" : "Money owed"}</dd></div></dl><div className="flex gap-2"><Button variant="outline" onClick={() => setPreview(null)}>Cancel</Button><Button onClick={async () => { if (!preview?.identity || !preview.convention) return; await save({ data: { batch: batch.id, expected: (batch.statement_review ?? {}) as Record<string, unknown>, review: { ...preview, identity: preview.identity, convention: preview.convention } } }); setPreview(null); reset(); await onReload(); window.dispatchEvent(new Event("ledgerline:statement-updated")); toast.success("Statement account and coverage confirmation saved."); }}>Confirm statement evidence</Button></div></DialogContent></Dialog>
    <Dialog open={copyPreview} onOpenChange={setCopyPreview}><DialogContent><DialogHeader><DialogTitle>Copy statement to the correct account?</DialogTitle><DialogDescription>{account?.name} → {accounts.find(a=>a.id===copyAccount)?.name}. Original imports, approvals, transactions and balances stay unchanged. A separate unapproved import is created or an existing identical copy is reopened; no entries are posted.</DialogDescription></DialogHeader><Button variant="outline" onClick={()=>setCopyPreview(false)}>Cancel</Button><Button onClick={async()=>{const result=await copy({data:{batch:batch.id,account:copyAccount}});setCopyPreview(false);await onReload();toast.success(result.reused?'Existing statement copy is available in Saved statements.':'Correct-account copy created; open it in Saved statements and process it for review.');}}>Confirm source copy</Button></DialogContent></Dialog>
  </section>;
}