import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "./StatusBadge";
import { approve, canReview, reimburse, reject, money, userById, type Expense } from "@/lib/expenses";
import { useStore } from "@/lib/store";

const ACTION_LABEL = {
  submitted: "Submitted",
  manager_approved: "Manager approved",
  finance_approved: "Finance signed off",
  rejected: "Rejected",
  reimbursed: "Reimbursed",
};

export function ExpenseDialog({ expense, onClose }: { expense: Expense | null; onClose: () => void }) {
  const { user, upsert } = useStore();
  const [note, setNote] = useState("");
  if (!expense) return null;
  const e = expense;
  const reviewable = canReview(user, e);
  const payable = user.role === "finance" && e.status === "approved";

  const act = (fn: () => Expense, msg: string) => {
    try {
      upsert(fn());
      toast.success(msg);
      setNote("");
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-medium">{e.title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <StatusBadge status={e.status} />
          <span>{userById(e.employeeId)?.name}</span>·<span>{e.department}</span>·<span>{e.category}</span>·<span>{e.date}</span>
        </div>
        <div className="font-mono text-3xl">{money(e.amount)}</div>
        {e.description && <p className="text-sm">{e.description}</p>}

        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Receipts</h4>
          <div className="flex flex-wrap gap-3">
            {e.receipts.map((r, i) =>
              r.type.startsWith("image/") ? (
                <a key={i} href={r.dataUrl} target="_blank" rel="noreferrer">
                  <img src={r.dataUrl} alt={r.name} className="h-32 w-24 rounded border object-cover" />
                </a>
              ) : (
                <a key={i} href={r.dataUrl} download={r.name} className="flex h-32 w-24 items-center justify-center rounded border p-2 text-center text-xs underline">
                  {r.name}
                </a>
              ),
            )}
          </div>
        </div>

        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Audit trail</h4>
          <ol className="space-y-2 border-l pl-4">
            {e.history.map((h, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium">{ACTION_LABEL[h.action]}</span> by {userById(h.by)?.name}
                <span className="ml-2 font-mono text-xs text-muted-foreground">{new Date(h.at).toLocaleString()}</span>
                {h.note && <div className="text-muted-foreground italic">“{h.note}”</div>}
              </li>
            ))}
          </ol>
        </div>

        {reviewable && (
          <div className="space-y-2 rounded-md border bg-muted/50 p-3">
            <div className="text-sm font-medium">
              {e.status === "pending_manager" ? "Department manager review" : "Finance sign-off"}
            </div>
            <Textarea placeholder="Note (required to reject)" value={note} onChange={(ev) => setNote(ev.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => act(() => reject(e, user, note), "Expense rejected")}>Reject</Button>
              <Button onClick={() => act(() => approve(e, user, note || undefined), "Expense approved")}>Approve</Button>
            </div>
          </div>
        )}
        {payable && (
          <div className="flex justify-end">
            <Button onClick={() => act(() => reimburse(e, user), "Marked as reimbursed")}>Mark reimbursed</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
