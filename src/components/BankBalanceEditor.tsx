import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { useStore } from "@/lib/store";
import { type Account, balanceAsOf } from "@/lib/ledger";
import { money } from "@/lib/expenses";
import { todayISO } from "@/lib/use-position";
import { validateBankBalance } from "@/lib/loan-funding";
import { confirmAction } from "@/lib/confirm";

export function BankBalanceEditor({ account }: { account: Account }) {
  const fieldId = useId();
  const { adjustBalance, updateAccount, transactions } = useStore();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <details className="mt-3 border-t pt-3">
    <summary className="cursor-pointer text-sm font-medium">Update bank balance</summary>
    <form className="mt-3 space-y-3" onSubmit={async e => {
      e.preventDefault(); if (busy) return;
      setBusy(true); setError("");
      try {
        if (!amount.trim()) throw new Error("Enter the balance shown by your bank");
        const actual = Number(amount); validateBankBalance(actual, date, todayISO());
        const recorded = balanceAsOf(account, transactions, date);
        if (!await confirmAction({ title: "Confirm bank balance", message: `${account.name} on ${date}: ${money(recorded)} → ${money(actual)}. This records a balance adjustment, not income or an EMI payment.`, confirmLabel: "Confirm balance" })) return;
        await adjustBalance(account, actual, date);
        await updateAccount(account.id, { details: { ...account.details, needsBalance: false, balanceConfirmedOn: date } as NonNullable<Account["details"]> });
        toast.success("Bank balance updated"); setAmount("");
      } catch (err) { setError(err instanceof Error ? err.message : "Balance update failed. Please retry."); }
      finally { setBusy(false); }
    }}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><Label htmlFor={`${fieldId}-balance`}>Bank balance (₹)</Label><Input id={`${fieldId}-balance`} type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></div>
        <div><Label htmlFor={`${fieldId}-date`}>Balance date</Label><Input id={`${fieldId}-date`} type="date" max={todayISO()} value={date} onChange={e => setDate(e.target.value)} /></div>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" loading={busy}>Review balance update</Button>
    </form>
  </details>;
}