
import { exportFile } from "@/lib/export-gate";
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/lib/store';
import { useBooks } from '@/components/books/useBooks';
import { Button } from '@/components/ui/button';
import { balanceAsOf } from '@/lib/ledger';
import { buildPeriodFigures, figureChecks, parsePeriodFigures, reproduceFromEvidence, type FigureCheck } from '@/lib/books/period-figures';
import type { Json } from '@/integrations/supabase/types';
type Row = { id: string; period_id: string; action: string; created_at: string; evidence: Json };
type ImportedRow = { id: string; imported_at: string; history: Json };
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const fmt = (c: FigureCheck) => (Number.isInteger(c.stored) && Number.isInteger(c.recomputed) && Math.abs(c.stored) < 10000 && Math.abs(c.recomputed) < 10000 ? `${c.stored}` : `${inr(c.stored)}`);

export function PeriodEvidence({ revision }: { revision: string }) {
  const { userId, transactions, accounts } = useStore();
  const { books } = useBooks();
  const [rows, setRows] = useState<Row[]>([]);
  const [imports, setImports] = useState<ImportedRow[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setRows([]); setImports([]); setError('');
    supabase.from('period_close_evidence').select('id,period_id,action,created_at,evidence').eq('owner_id', userId).order('created_at', { ascending: false }).limit(200).then(({ data, error }) => {
      if (!active) return;
      if (error) setError(error.message); else setRows(data ?? []);
    });
    supabase.from('imported_period_history').select('id,imported_at,history').eq('owner_id', userId).order('imported_at', { ascending: false }).limit(200).then(({ data, error }) => {
      if (!active) return;
      if (error) setError(error.message); else setImports(data ?? []);
    });
    return () => { active = false; };
  }, [userId, revision]);
  // Recompute each closed period's figures from current records to detect any drift from the frozen snapshot.
  const drift = useMemo(() => {
    const out = new Map<string, FigureCheck[]>();
    for (const row of rows) {
      if (row.action !== 'closed') continue;
      const e = row.evidence && typeof row.evidence === 'object' && !Array.isArray(row.evidence) ? (row.evidence as Record<string, unknown>) : {};
      const stored = parsePeriodFigures(e['derivedFigures']);
      const from = String(e['from'] ?? ''), to = String(e['to'] ?? '');
      if (!stored || !from || !to) continue;
      const current = buildPeriodFigures({
        from, to,
        entries: transactions.map((t) => ({ date: t.date, amount: t.amount, txnType: t.txnType ?? 'expense', reconciled: !!t.reconciledAt })),
        accounts: accounts.map((a) => ({ id: a.id, balanceAt: (upto: string) => balanceAsOf(a, transactions, upto) })),
        invoices: books.gstInvoices, journals: books.journals,
      });
      out.set(row.id, figureChecks(stored, current));
    }
    return out;
  }, [rows, transactions, accounts, books]);
  if (error) return <p className="text-xs text-destructive">Closing evidence unavailable: {error}</p>;
  return <details className="text-xs"><summary className="cursor-pointer">Saved closing evidence ({rows.length})</summary>
    {rows.map((row) => {
      const e = row.evidence && typeof row.evidence === 'object' && !Array.isArray(row.evidence) ? (row.evidence as Record<string, unknown>) : {};
      const later = rows.find((r) => r.period_id === row.period_id && r.action === 'reopened' && r.created_at > row.created_at);
      const stored = parsePeriodFigures(e['derivedFigures']);
      const reproduced = stored ? reproduceFromEvidence(row.evidence) : null;
      const reproChecks = stored && reproduced ? figureChecks(stored, reproduced, true) : null;
      const driftChecks = drift.get(row.id);
      const drifted = driftChecks?.filter((c) => !c.match) ?? [];
      return <div className="border-b py-2" key={row.id}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="min-w-0 break-words">{String(e['from'] ?? row.period_id)}{e['to'] ? ` → ${e['to']}` : ''} · {row.action} {row.created_at.slice(0, 10)}
            {row.action === 'closed' && <span className="block text-muted-foreground">{String(e['entryCount'] ?? 0)} entries · {String(e['reconciled'] ?? 0)} reconciled · {later ? 'Reopened; original evidence retained' : 'Saved-record snapshot'}</span>}
          </span>
          <Button size="sm" variant="outline" onClick={() => {
            const blob = (new Blob([JSON.stringify(row.evidence, null, 2)], { type: 'application/json' }));
            void exportFile({ kind: "evidence" }, blob, `Thapal_close_evidence_${row.id}.json`);
          }}>Download evidence</Button>
        </div>
        {row.action === 'closed' && stored && (
          <div className="mt-1 space-y-1 rounded-lg border p-2">
            <p className="font-semibold">Frozen figures {reproChecks ? (reproChecks.every((c) => c.match) ? '· reproducible from the snapshot' : '· SNAPSHOT MISMATCH') : ''}</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-3">
              <span>Income {inr(stored.entries.income)}</span><span>Expenses {inr(stored.entries.expenses)}</span><span>Reconciled {stored.entries.reconciled}/{stored.entries.count}</span>
              <span>GST collected {inr(stored.gst.outputTax)}</span><span>GST on purchases {inr(stored.gst.inputTax)}</span><span>Depreciation {inr(stored.depreciation.posted)}</span>
            </div>
            {reproChecks && !reproChecks.every((c) => c.match) && <p className="text-destructive">The snapshot's own records no longer produce the stored figures: {reproChecks.filter((c) => !c.match).map((c) => c.label).join(', ')}.</p>}
            {driftChecks && <p className={drifted.length ? 'text-destructive' : 'text-muted-foreground'}>{drifted.length ? `Current records differ from the frozen figures: ${drifted.map((c) => `${c.label} (frozen ${fmt(c)}, now ${inr(c.recomputed)})`).join('; ')}. Reopen the period with a reason if this is intended.` : 'Current records still produce exactly the frozen figures.'}</p>}
          </div>
        )}
      </div>;
    })}
    {!rows.length && <p className="py-2 text-muted-foreground">No saved closing evidence. Earlier closures have no captured snapshot.</p>}
    {imports.map((row) => <div className="flex flex-wrap items-center justify-between gap-2 border-b py-2" key={row.id}>
      <span className="text-muted-foreground">Imported closing history · {row.imported_at.slice(0, 10)}<span className="block">Unverified backup copy; not an active closure or authoritative snapshot</span></span>
      <Button size="sm" variant="outline" onClick={() => {
        const blob = (new Blob([JSON.stringify({ verification: 'Unverified imported backup history', importedAt: row.imported_at, history: row.history }, null, 2)], { type: 'application/json' }));
        void exportFile({ kind: "evidence" }, blob, `Thapal_imported_closing_history_${row.id}.json`);
      }}>Download imported history</Button>
    </div>)}
  </details>;
}
