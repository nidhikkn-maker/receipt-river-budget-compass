import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { PageTitle } from '@/components/AppShell';
import { FinancialInboxNav } from '@/components/FinancialInboxNav';
import { AccountStatementStatus } from '@/components/AccountStatementStatus';
import { AccountsCheck, Reimbursements } from '@/components/InboxLegacyTools';
import { ExpenseDialog } from '@/components/ExpenseDialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useStore } from '@/lib/store';
import type { Expense } from '@/lib/expenses';
import { todayISO } from '@/lib/use-position';
export const Route = createFileRoute('/_authenticated/account-reconciliation')({
  validateSearch: (s: Record<string, unknown>): { section?: string } => ({ section: s['section'] === 'reimbursements' ? 'reimbursements' : 'accounts' }),
  head: () => ({ meta: [{ title: 'Account Reconciliation — Ledgerline' }, { name: 'description', content: 'Review saved statement coverage, verified balances and account reconciliation evidence.' }, { property: 'og:title', content: 'Account Reconciliation — Ledgerline' }, { property: 'og:description', content: 'Independent statement, balance and reconciliation checks.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
  component: Reconciliation,
});
function Reconciliation() {
  const store = useStore(), { section } = Route.useSearch();
  const [open, setOpen] = useState<Expense | null>(null);
  return <div className="space-y-4"><Button asChild variant="ghost" size="sm"><Link to="/inbox">← Financial Inbox</Link></Button><PageTitle title="Account Reconciliation" /><FinancialInboxNav active="accounts" /><Tabs defaultValue={section}><TabsList><TabsTrigger value="accounts">Accounts</TabsTrigger><TabsTrigger value="reimbursements">Reimbursements</TabsTrigger></TabsList><TabsContent value="accounts"><AccountStatementStatus /><details className="mt-6"><summary className="cursor-pointer text-sm font-medium">Manual balance comparison</summary><div className="mt-4"><AccountsCheck onOpen={setOpen} /></div></details></TabsContent><TabsContent value="reimbursements"><Reimbursements list={store.expenses} onOpen={setOpen} today={todayISO()} /></TabsContent></Tabs><ExpenseDialog expense={store.transactions.find(t => t.id === open?.id) ?? null} onClose={() => setOpen(null)} /></div>;
}