import { useState } from "react";
import { BadgeCheck } from "lucide-react";
import { whoLabel, PAYMENT_LABEL, BASE_CURRENCY, money, type Expense } from "@/lib/expenses";
import { ScopeBadge } from "./ScopeBadge";
import { ExpenseDialog, ExpenseDetail } from "./ExpenseDialog";
import { useStore } from "@/lib/store";
import { useTabletLandscape } from "@/hooks/use-mobile";
import { Button } from "./ui/button";

/** Expenses as perforated "ticket" cards. Pass selected/onToggle to turn cards into multi-select rows. On iPad landscape the detail opens in a side pane next to the list. */
export function ExpenseTable({ items, empty = "Nothing here yet.", selected, onToggle }: { items: Expense[]; empty?: string; selected?: Set<string> | undefined; onToggle?: ((id: string) => void) | undefined }) {
  const { memberName } = useStore();
  const [open, setOpen] = useState<Expense | null>(null);
  const selecting = !!onToggle;
  const sideBySide = useTabletLandscape() && !selecting;
  if (items.length === 0) return <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">{empty}</div>;
  const list = (
      <ul className={"grid min-w-0 grid-cols-1 gap-3" + (sideBySide ? "" : " md:grid-cols-2")}>
        {items.map((e) => {
          const day = new Date(e.date + "T00:00:00");
          const checked = selected?.has(e.id) ?? false;
          const isOpen = sideBySide && open?.id === e.id;
          return (
            <li key={e.id} className="min-w-0">
              <Button variant="ghost" onClick={() => (selecting ? onToggle(e.id) : setOpen(e))} aria-pressed={selecting ? checked : isOpen} className={"ticket flex h-auto w-full items-stretch justify-start gap-0 overflow-hidden whitespace-normal rounded-2xl border bg-card p-0 text-left transition hover:shadow-float" + (checked || isOpen ? " ring-2 ring-gold" : "")}>
                {selecting && <span className={"flex w-8 shrink-0 items-center justify-center border-r " + (checked ? "bg-gold text-gold-foreground" : "bg-secondary/50 text-muted-foreground")} aria-hidden>{checked ? "✓" : ""}</span>}
                <div className={"flex w-16 shrink-0 flex-col items-center justify-center border-r border-dashed py-3 " + (e.scope === "business" ? "bg-primary text-primary-foreground" : "bg-secondary/70")}>
                  <span className="font-mono text-[10px] opacity-70">{day.toLocaleString("en", { month: "short" })}</span>
                  <span className="font-display text-2xl font-extrabold leading-none">{day.getDate()}</span>
                </div>
                <div className="min-w-0 flex-1 px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{e.title}</div>
                      <div className="truncate text-xs text-muted-foreground">{[e.merchant, e.category, PAYMENT_LABEL[e.paymentMethod]].filter(Boolean).join(" · ")}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-mono text-sm font-medium">{money(e.originalAmount, e.currency)}</div>
                      {e.currency !== BASE_CURRENCY && <div className="font-mono text-[11px] text-muted-foreground">≈ {money(e.amount)}</div>}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <ScopeBadge scope={e.scope} />
                    <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">{whoLabel(e, memberName)}</span>
                    {e.reconciledAt && <BadgeCheck className="ml-auto h-4 w-4 text-success" aria-label="Matched to bank statement" />}
                  </div>
                </div>
              </Button>
            </li>
          );
        })}
      </ul>
  );
  if (sideBySide) {
    return (
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,26rem)] items-start gap-4">
        {list}
        <aside aria-label="Expense details" className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border bg-card p-5">
          {open ? (
            <>
              <div className="mb-3 flex justify-end"><Button variant="ghost" size="sm" onClick={() => setOpen(null)}>Close</Button></div>
              <ExpenseDetail expense={open} onClose={() => setOpen(null)} />
            </>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">Choose an expense to see its details here.</p>
          )}
        </aside>
      </div>
    );
  }
  return (
    <>
      {list}
      <ExpenseDialog expense={open} onClose={() => setOpen(null)} />
    </>
  );
}
