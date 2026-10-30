import { useState } from "react";
import { BadgeCheck } from "lucide-react";
import { PAYMENT_LABEL, BASE_CURRENCY, money, type Expense } from "@/lib/expenses";
import { ScopeBadge } from "./ScopeBadge";
import { ExpenseDialog } from "./ExpenseDialog";
import { useStore } from "@/lib/store";

/** Expenses as perforated "ticket" cards. */
export function ExpenseTable({ items, empty = "Nothing here yet." }: { items: Expense[]; empty?: string }) {
  const { memberName } = useStore();
  const [open, setOpen] = useState<Expense | null>(null);
  if (items.length === 0) return <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">{empty}</div>;
  return (
    <>
      <ul className="grid gap-3 md:grid-cols-2">
        {items.map((e) => {
          const day = new Date(e.date + "T00:00:00");
          return (
            <li key={e.id}>
              <button onClick={() => setOpen(e)} className="ticket flex w-full items-stretch overflow-hidden rounded-2xl border bg-card text-left transition hover:shadow-float">
                <div className={"flex w-16 shrink-0 flex-col items-center justify-center border-r border-dashed py-3 " + (e.scope === "business" ? "bg-primary text-primary-foreground" : "bg-secondary/70")}>
                  <span className="font-mono text-[10px] uppercase opacity-70">{day.toLocaleString("en", { month: "short" })}</span>
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
                  <div className="mt-2 flex items-center gap-2">
                    <ScopeBadge scope={e.scope} />
                    <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">{memberName(e.memberId)}</span>
                    {e.reconciledAt && <BadgeCheck className="ml-auto h-4 w-4 text-success" aria-label="Matched to bank statement" />}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      <ExpenseDialog expense={open} onClose={() => setOpen(null)} />
    </>
  );
}
