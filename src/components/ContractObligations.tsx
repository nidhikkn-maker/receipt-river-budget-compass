import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fieldCls } from "@/components/Money";
import { useStore } from "@/lib/store";
import { FREQ_LABEL } from "@/lib/planning";
import { cancelBy, noticeDeadlines, obligationToCommitment, OBLIGATION_FREQUENCIES, type ContractObligation } from "@/lib/contracts";
import { todayISO } from "@/lib/use-position";

/** Notice deadlines across all documents (shown at the top of the vault). */
export function NoticeDeadlines() {
  const { preferences, documents } = useStore();
  const list = noticeDeadlines(preferences.contractObligations, todayISO());
  if (!list.length) return null;
  return <div className="mb-4 border-l-4 border-accent bg-secondary p-3 text-sm">{list.map(({ o, by }) => <p key={o.id}>Give notice by <b>{by}</b> to stop “{o.label}” — {documents.find((d) => d.id === o.docId)?.title ?? "document"}</p>)}</div>;
}

/** Review obligations read from one document. Nothing is added until you press Add to plan. */
export function ContractObligations({ docId }: { docId: string }) {
  const { preferences, savePreferences, saveCommitment, documents, accounts } = useStore();
  const doc = documents.find((d) => d.id === docId);
  const mine = preferences.contractObligations.filter((o) => o.docId === docId && o.status !== "ignored");
  const [busy, setBusy] = useState(false);
  const [account, setAccount] = useState("");
  if (!doc || !mine.length) return null;
  const patch = async (id: string, p: Partial<ContractObligation>) => {
    setBusy(true);
    try { await savePreferences({ ...preferences, contractObligations: preferences.contractObligations.map((o) => (o.id === id ? { ...o, ...p } : o)) }); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const add = async (o: ContractObligation) => {
    setBusy(true);
    try {
      await saveCommitment(obligationToCommitment(o, doc.title, doc.docType, account || null));
      await savePreferences({ ...preferences, contractObligations: preferences.contractObligations.map((x) => (x.id === o.id ? { ...x, status: "added", decidedAt: new Date().toISOString() } : x)) });
      toast.success("Added to your plan");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="mt-3 rounded-lg bg-muted/40 p-3">
      <p className="mb-2 text-xs font-semibold text-muted-foreground">Obligations found in this document — check before adding</p>
      {mine.map((o) => (
        <div key={o.id} className="mb-3 border-b pb-3 text-sm last:mb-0 last:border-0 last:pb-0">
          <p className="font-semibold">{o.label}{o.status === "added" && <span className="ml-2 text-xs text-primary">Added to plan</span>}</p>
          {o.evidence && <p className="text-xs italic text-muted-foreground">“{o.evidence}”</p>}
          {o.status === "review" ? (
            <>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Input aria-label="Amount" type="number" placeholder="Amount" defaultValue={o.amount ?? ""} onBlur={(e) => void patch(o.id, { amount: Number(e.target.value) || null })} />
                <Input aria-label="Next due" type="date" defaultValue={o.dueDate ?? ""} onBlur={(e) => void patch(o.id, { dueDate: e.target.value || null })} />
                <select aria-label="How often" className={fieldCls} value={o.frequency} onChange={(e) => void patch(o.id, { frequency: e.target.value as ContractObligation["frequency"] })}>{OBLIGATION_FREQUENCIES.map((f) => <option key={f} value={f}>{FREQ_LABEL[f]}</option>)}</select>
                <Input aria-label="Notice days" type="number" placeholder="Notice days" defaultValue={o.noticeDays ?? ""} onBlur={(e) => void patch(o.id, { noticeDays: e.target.value ? Math.min(365, Math.max(0, Number(e.target.value))) : null })} />
              </div>
              {cancelBy(o) && <p className="mt-1 text-xs">Give notice by {cancelBy(o)} if you want to stop it.</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select aria-label="Paid from" className={`${fieldCls} h-9 w-auto`} value={account} onChange={(e) => setAccount(e.target.value)}><option value="">Any account</option>{accounts.filter((a) => !a.archived).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
                <Button size="sm" disabled={busy} onClick={() => void add(o)}>Add to plan</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void patch(o.id, { status: "ignored", decidedAt: new Date().toISOString() })}>Ignore</Button>
              </div>
            </>
          ) : <p className="text-xs text-muted-foreground">{o.amount != null ? `₹${o.amount.toLocaleString("en-IN")}` : ""} · {FREQ_LABEL[o.frequency]} · next {o.dueDate}{cancelBy(o) ? ` · notice by ${cancelBy(o)}` : ""}</p>}
        </div>
      ))}
    </div>
  );
}
