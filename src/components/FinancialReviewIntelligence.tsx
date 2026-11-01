import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import { ImportRules } from './ImportRules';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { reviewCohorts, reviewRuleSeed } from '@/lib/financial-review-intelligence';
import type { FinancialReview } from '@/lib/financial-review';
import type { ImportRule } from '@/lib/historical-import';
import type { Commitment } from '@/lib/planning';
import { money, type Expense } from '@/lib/expenses';

export function FinancialReviewIntelligence({ rows, commitments, onSelect, ruleExpense, category }: {
  rows: FinancialReview[]; commitments: Commitment[]; onSelect: (ids: string[]) => void; ruleExpense: Expense | undefined; category: string;
}) {
  const cohorts = useMemo(() => reviewCohorts(rows, commitments), [rows, commitments]);
  const [seed, setSeed] = useState<ImportRule | undefined>();
  const [rulesOpen, setRulesOpen] = useState(false);
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => { setSeed(undefined); setRulesOpen(true); }}>Manage classification rules</Button>{ruleExpense && <Button variant="outline" size="sm" onClick={() => { try { setSeed(reviewRuleSeed(ruleExpense, category || ruleExpense.category)); setRulesOpen(true); } catch (e) { toast.error((e as Error).message); } }}>Remember selected classification</Button>}</div>
    {cohorts.length > 0 && <details><summary className="cursor-pointer text-sm font-medium">Merchant batches & recurring patterns ({cohorts.length})</summary><ul className="mt-3 divide-y">{cohorts.map(cohort => <li key={cohort.key} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="break-words text-sm font-medium">{cohort.rows.length} · {cohort.label}</p><p className="text-xs text-muted-foreground">{cohort.rows[0]?.transaction.currency} · {cohort.rows[0]?.transaction.scope} · {cohort.rows[0]?.transaction.department || 'Organisation unknown'} · {cohort.rows[0]?.suggestedCategory ?? cohort.rows[0]?.transaction.category}</p>{cohort.cadence && <p className="text-xs text-muted-foreground">Possible {cohort.cadence}-day recurring pattern{cohort.changedAmount ? ' · amount increased' : ''}{cohort.profileIds.length ? ` · ${cohort.profileIds.length} existing subscription profile${cohort.profileIds.length > 1 ? 's — possible overlap' : ''}` : ' · no exact profile match'}</p>}</div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => onSelect(cohort.rows.map(r => r.transaction.id))}>Select batch</Button>{cohort.cadence && <Button asChild variant="ghost" size="sm"><Link to="/plan">Review recurring plan</Link></Button>}</div></li>)}</ul><p className="text-xs text-muted-foreground">Recurring hints do not create payments or remove repeated entries. Category changes still need an exact preview.</p></details>}
    <Dialog open={rulesOpen} onOpenChange={setRulesOpen}><DialogContent className="max-h-[88dvh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Remember with conditions</DialogTitle><DialogDescription>Choose account, merchant and optional conditions, then preview before saving. Existing records are unchanged.</DialogDescription></DialogHeader><ImportRules seed={seed} /></DialogContent></Dialog>
  </div>;
}