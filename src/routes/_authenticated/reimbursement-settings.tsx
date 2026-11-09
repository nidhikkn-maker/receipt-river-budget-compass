import { createFileRoute, Link } from '@tanstack/react-router';
import { PageTitle } from '@/components/AppShell';
import { ReimbursementSettings } from '@/components/ReimbursementSettings';
export const Route = createFileRoute('/_authenticated/reimbursement-settings')({ head: () => ({ meta: [
  { title: 'Reimbursement profiles — Thapal' }, { name: 'description', content: 'Organisation-specific claimant roles, approval details and reimbursement accounts.' }, { property: 'og:title', content: 'Reimbursement profiles — Thapal' }, { property: 'og:description', content: 'Organisation-specific claimant roles, approval details and reimbursement accounts.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' },
] }), component: () => <div className="space-y-5 pb-20"><Link to="/settings" className="text-sm text-muted-foreground">Settings / Financial setup</Link><PageTitle title="Reimbursements" /><ReimbursementSettings /></div> });