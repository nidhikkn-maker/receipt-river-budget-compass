import { createFileRoute, Link } from '@tanstack/react-router';
import { PageTitle } from '@/components/AppShell';
import { ImportRules } from '@/components/ImportRules';
import { Button } from '@/components/ui/button';
export const Route = createFileRoute('/_authenticated/classification-rules')({
  head: () => ({ meta: [{ title: 'Transaction Classification Rules — Ledgerline' }, { name: 'description', content: 'Review and edit confirmed merchant classification rules and specific account conditions.' }, { property: 'og:title', content: 'Transaction Classification Rules — Ledgerline' }, { property: 'og:description', content: 'Manage confirmed merchant rules without changing original records.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
  component: () => <div><Button asChild variant="ghost" size="sm"><Link to="/settings">← Settings</Link></Button><PageTitle title="Transaction Classification Rules" /><ImportRules /></div>,
});