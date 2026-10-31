import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScopeToggle } from "./ScopeBadge";
import { whoLabel, BASE_CURRENCY, PAYMENT_LABEL, money, type Expense } from "@/lib/expenses";
import { useStore } from "@/lib/store";

function ReceiptThumb({ path, name, type }: { path: string; name: string; type: string }) {
  const { signedUrl } = useStore();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { void signedUrl(path).then(setUrl); }, [path, signedUrl]);
  if (!url) return <div className="h-32 w-24 animate-pulse rounded-xl border bg-muted" />;
  return type.startsWith("image/") ? (
    <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={name} className="h-32 w-24 rounded-xl border object-cover" /></a>
  ) : (
    <a href={url} target="_blank" rel="noreferrer" className="flex h-32 w-24 items-center justify-center rounded-xl border p-2 text-center text-xs underline">{name}</a>
  );
}

export function ExpenseDialog({ expense, onClose }: { expense: Expense | null; onClose: () => void }) {
  const { memberName, setScope, remove } = useStore();
  const nav = useNavigate();
  const [scope, setLocalScope] = useState(expense?.scope ?? "personal");
  useEffect(() => { if (expense) setLocalScope(expense.scope); }, [expense]);
  if (!expense) return null;
  const e = expense;

  const changeScope = async (s: typeof scope) => {
    setLocalScope(s);
    try { await setScope(e.id, s); toast.success(`Moved to ${s}`); } catch (err) { toast.error((err as Error).message); }
  };
  const del = async () => {
    if (!confirm("Delete this expense and its receipts?")) return;
    try { await remove(e); toast.success("Expense deleted"); onClose(); } catch (err) { toast.error((err as Error).message); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto rounded-3xl">
        <DialogHeader><DialogTitle className="font-display text-2xl font-bold">{e.title}</DialogTitle></DialogHeader>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>{e.date}</span>·<span>{e.category}</span>·<span>{PAYMENT_LABEL[e.paymentMethod]}</span>·<span>For {whoLabel(e, memberName)}</span>
          {e.merchant && <>·<span>{e.merchant}</span></>}
        </div>
        <div>
          <div className="font-mono text-3xl">{money(e.originalAmount, e.currency)}</div>
          {e.currency !== BASE_CURRENCY && (
            <div className="text-sm text-muted-foreground">≈ <span className="font-mono">{money(e.amount)}</span> at 1 {e.currency} = {e.fxRate.toFixed(4)} {BASE_CURRENCY}</div>
          )}
        </div>
        {e.receiptDetails?.tax != null && <p className="text-sm">Tax included: <span className="font-mono">{money(e.receiptDetails.tax,e.currency)}</span></p>}
        {!!e.receiptDetails?.items?.length && <ul className="divide-y">{e.receiptDetails.items.map((item,i)=><li key={i} className="flex justify-between gap-3 py-2 text-sm"><span>{item.name} × {item.quantity}</span><span className="font-mono">{money(item.amount,e.currency)}</span></li>)}</ul>}
        <ScopeToggle value={scope} onChange={changeScope} />
        {e.description && <p className="text-sm">{e.description}</p>}
        {e.reconciledAt && <p className="text-sm text-success">Matched to bank statement: {e.statementRef}</p>}
        {e.receipts.length > 0 && (
          <div className="flex flex-wrap gap-3">{e.receipts.map((r) => <ReceiptThumb key={r.path} {...r} />)}</div>
        )}
        <div className="flex justify-between gap-2 pt-2">
          <Button variant="ghost" className="text-destructive" onClick={del}>Delete</Button>
          <Button variant="outline" onClick={() => { onClose(); nav({ to: "/new", search: { edit: e.id } }); }}>Edit</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
