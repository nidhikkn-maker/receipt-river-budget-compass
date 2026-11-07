import { useStore, type Loan } from "@/lib/store";
import { emiTargets } from "@/lib/emi-match";
import { bankBalanceKnown, currentBankBalance, loanFundingReminders } from "@/lib/loan-funding";
import { paymentReadiness } from "@/lib/readiness";
import { todayISO } from "@/lib/use-position";
import { money } from "@/lib/expenses";
import { BankBalanceEditor } from "./BankBalanceEditor";

export function LoanFundingPanel({ loan }: { loan: Loan }) {
  const { accounts, transactions, commitments, loans, preferences } = useStore();
  const today = todayISO();
  const target = emiTargets([loan], commitments, accounts)[0];
  const account = accounts.find(a => !a.archived && a.id === target?.payFromAccountId);
  if (!target || !account) return null;
  const known = bankBalanceKnown(account);
  const balance = currentBankBalance(account, transactions, today);
  const readiness = paymentReadiness({ commitments, accounts, transactions, today, horizonDays: 35 }).filter(r => r.accountId === account.id && commitments.some(c => c.id === r.commitmentId && c.kind === "emi"));
  const reminders = preferences.reminders ? loanFundingReminders([target], loans, transactions, today, preferences.reminderDays) : [];
  const details = account.details as Record<string, unknown> | undefined;
  return <section aria-label={`${loan.name} payment coverage`} className="mt-4 border-t pt-4">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="min-w-0 break-words text-sm font-medium">{account.name}</h3>
      <span className="whitespace-nowrap font-mono text-sm">{known ? money(balance) : "Balance not confirmed"}</span>
    </div>
    {typeof details?.["balanceConfirmedOn"] === "string" && <p className="mt-1 text-xs text-muted-foreground">Balance confirmed {details["balanceConfirmedOn"]}; later recorded movements included.</p>}
    <div className="mt-2 divide-y">
      {readiness.map(r => <div key={`${r.commitmentId}:${r.date}`} className="flex flex-wrap justify-between gap-2 py-2 text-xs">
        <span className="min-w-0 break-words">{r.name} · {r.date} · {money(r.amount)}</span>
        <span className={r.status === "shortfall" || r.status === "overdue" ? "text-destructive" : "text-muted-foreground"}>{!known || r.status === "unknown" ? "Update balance to check" : r.status === "overdue" ? "Overdue" : r.shortfall > 0 ? `${money(r.shortfall)} short` : "Covered by recorded balance"}</span>
      </div>)}
    </div>
    {reminders.map(r => <p key={r.key} role="status" className="mt-2 border-l-2 border-warning pl-3 text-xs text-foreground">{r.status === "missing" ? `No recorded transfer to ${account.name} for ${r.fundingDate}.` : `Recorded transfer ${money(r.received)} is ${money(r.shortfall)} below the EMI.`} Loan payment due {r.due}.{known && balance >= r.expected ? " Your recorded balance covers this EMI." : " Check the bank balance before payment."}</p>)}
    <BankBalanceEditor account={account} />
  </section>;
}