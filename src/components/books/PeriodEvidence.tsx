import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import type { Json } from '@/integrations/supabase/types';
type Row = { id: string; period_id: string; action: string; created_at: string; evidence: Json };
export function PeriodEvidence({ revision }: { revision: string }) {
  const { userId } = useStore();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setRows([]); setError('');
    supabase.from('period_close_evidence').select('id,period_id,action,created_at,evidence').eq('owner_id', userId).order('created_at', { ascending: false }).limit(200).then(({ data, error }) => {
      if (!active) return;
      if (error) setError(error.message); else setRows(data ?? []);
    });
    return () => { active = false; };
  }, [userId, revision]);
  if (error) return <p className="text-xs text-destructive">Closing evidence unavailable: {error}</p>;
  return <details className="text-xs"><summary className="cursor-pointer">Saved closing evidence ({rows.length})</summary>
    {rows.map((row) => {
      const e = row.evidence && typeof row.evidence === 'object' && !Array.isArray(row.evidence) ? row.evidence : {};
      const later = rows.find((r) => r.period_id === row.period_id && r.action === 'reopened' && r.created_at > row.created_at);
      return <div className="flex flex-wrap items-center justify-between gap-2 border-b py-2" key={row.id}>
        <span className="min-w-0 break-words">{String(e['from'] ?? row.period_id)}{e['to'] ? ` → ${e['to']}` : ''} · {row.action} {row.created_at.slice(0, 10)}
          {row.action === 'closed' && <span className="block text-muted-foreground">{String(e['entryCount'] ?? 0)} entries · {String(e['reconciled'] ?? 0)} reconciled · {later ? 'Reopened; original evidence retained' : 'Saved-record snapshot'}</span>}
        </span>
        <Button size="sm" variant="outline" onClick={() => {
          const url = URL.createObjectURL(new Blob([JSON.stringify(row.evidence, null, 2)], { type: 'application/json' }));
          const a = document.createElement('a'); a.href = url; a.download = `Ledgerline_close_evidence_${row.id}.json`; a.click(); URL.revokeObjectURL(url);
        }}>Download evidence</Button>
      </div>;
    })}
    {!rows.length && <p className="py-2 text-muted-foreground">No saved closing evidence. Earlier closures have no captured snapshot.</p>}
  </details>;
}