import { Link } from '@tanstack/react-router';
import { ArrowUpRight, BookOpen, CalendarDays, FileText, Landmark, Plane, Settings, ShieldCheck, Users } from 'lucide-react';

export const MODULE_GROUPS = [
  { title: 'Money', icon: Landmark, items: [ ['/expenses','Journal'], ['/wealth','Accounts & investments'], ['/payment-methods','Payment methods'], ['/transfers','Transfers'], ['/receivables','Money owed to you'], ['/allocation','Money allocation'], ['/connections','Money map'] ] },
  { title: 'Statements', icon: BookOpen, items: [ ['/statements','Statement Desk'], ['/inbox','Review'], ['/account-reconciliation','Account reconciliation'], ['/statement-accounts','Statement coverage'], ['/records-check','Records check'], ['/historical-import','Past imports'], ['/upload-requests','Accountant requests'], ['/rules','Classification rules'], ['/patterns','Merchant patterns'] ] },
  { title: 'Documents', icon: FileText, items: [ ['/vault','DocuRepo'], ['/drafts','Saved drafts'], ['/offline-receipts','Offline receipts'], ['/shared','Shared files'], ['/sync-queue','Waiting to sync'] ] },
  { title: 'Travel', icon: Plane, items: [ ['/trips','Trips'], ['/travel-inbox','Travel inbox'], ['/claim-submission','Expense claims'], ['/reimbursement-settings','Reimbursement profiles'] ] },
  { title: 'Business', icon: Users, items: [ ['/entities','Companies & years'], ['/company-spending','Company spending'], ['/assets','Property & assets'], ['/tax','Income tax & GST'], ['/gst-check','Suppliers & invoices'], ['/family','Family members'] ] },
  { title: 'Reports', icon: FileText, items: [ ['/reports','Spending insights'], ['/report-centre','Reports & exports'], ['/report-status','Report progress'], ['/expenditure-statement','Detailed expenditure'], ['/review','Monthly review'], ['/brief','Weekly brief'] ] },
  { title: 'Planning', icon: CalendarDays, items: [ ['/plan','Plan & calendar'], ['/budgets','Monthly budgets'], ['/forecast','Long-term forecast'], ['/strategy','What if…'] ] },
  { title: 'Administration & settings', icon: Settings, items: [ ['/settings','Settings & backup'], ['/audit','Audit & safeguards'], ['/search','Search everything'], ['/assistant','Financial assistant'], ['/assistants','Connected assistants'], ['/auth','Account & sign-in'] ] },
] as const;

/** Directory only: links to existing modules; never changes permission or ownership. */
export function ModuleDirectory({ onNavigate }: { onNavigate: () => void }) {
  return <div className="module-directory">
    {MODULE_GROUPS.map(group => <section key={group.title}>
      <h2 className="flex items-center gap-2"><group.icon className="size-4" />{group.title}</h2>
      <div>{group.items.map(([to,label]) => <Link key={to} to={to} onClick={onNavigate} className="module-link" activeProps={{ 'aria-current': 'page' }}><span>{label}</span><ArrowUpRight className="size-4 text-muted-foreground" /></Link>)}</div>
    </section>)}
    <p className="flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck className="size-4" />Your saved access applies in every space.</p>
  </div>;
}