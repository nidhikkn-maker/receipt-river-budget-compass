import { useState } from "react";
import { money, userById, type Expense } from "@/lib/expenses";
import { StatusBadge, StageTrack } from "./StatusBadge";
import { ExpenseDialog } from "./ExpenseDialog";

export function ExpenseTable({ items, showEmployee = true, empty = "Nothing here." }: { items: Expense[]; showEmployee?: boolean; empty?: string }) {
  const [open, setOpen] = useState<Expense | null>(null);
  if (items.length === 0) return <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">{empty}</div>;
  return (
    <>
      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Expense</th>
              {showEmployee && <th className="px-4 py-2">Employee</th>}
              <th className="px-4 py-2">Progress</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((e) => (
              <tr key={e.id} onClick={() => setOpen(e)} className="cursor-pointer border-b last:border-0 hover:bg-muted/40">
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{e.date}</td>
                <td className="px-4 py-3">
                  <div className="font-medium">{e.title}</div>
                  <div className="text-xs text-muted-foreground">{e.category} · {e.department}</div>
                </td>
                {showEmployee && <td className="px-4 py-3">{userById(e.employeeId)?.name}</td>}
                <td className="px-4 py-3"><StageTrack status={e.status} /></td>
                <td className="px-4 py-3"><StatusBadge status={e.status} /></td>
                <td className="px-4 py-3 text-right font-mono">{money(e.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ExpenseDialog expense={open} onClose={() => setOpen(null)} />
    </>
  );
}
