import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { toast } from 'sonner';
type Change = { id: string; date: string; label: string; undone: boolean; lines: string[]; undo: () => Promise<void> };
export function ReviewHistory() {
  const store = useStore();
  const [rows,setRows]=useState<Change[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[pending,setPending]=useState<Change|null>(null);
  const load=async()=>{
    setLoading(true);
    try {
      const [categories,financial,metadata]=await Promise.all([store.categoryHistory(),store.financialCorrectionHistory(),store.reviewMetadataHistory()]);
      setRows([
        ...categories.map(b=>({id:b.id,date:b.createdAt,label:`Category · ${b.entries.length} transactions`,undone:!!b.undoneAt,lines:b.entries.map(e=>`${e.title}: ${e.from} → ${b.category}`),undo:()=>store.undoCategoryBatch(b.id)})),
        ...financial.map(b=>({id:b.id,date:b.createdAt,label:`Account / type · ${b.count} transactions`,undone:false,lines:b.entries.map(e=>`${e.before.title}: ${e.before.txn_type} → ${e.after.txn_type}`),undo:()=>store.undoFinancialCorrection(b.id)})),
        ...metadata.map(b=>({id:b.id,date:b.createdAt,label:`Mappings · ${b.entries.length} transactions`,undone:false,lines:b.entries.map(e=>`${String(e.before['title']??'Transaction')}: ${Object.keys(e.after).filter(k=>JSON.stringify(e.before[k])!==JSON.stringify(e.after[k])&&!['correction_revision','updated_at'].includes(k)).map(k=>`${k.replaceAll('_',' ')}: ${String(e.before[k]??'Unknown')} → ${String(e.after[k]??'Unknown')}`).join('; ')}`),undo:()=>store.undoReviewMetadata(b.id)}))
      ].sort((a,b)=>b.date.localeCompare(a.date)));setError('');
    } catch {setError('Review history could not load. Retry before restoring any change.');} finally {setLoading(false);}
  };
  useEffect(()=>{void load();},[]);
  return <section className="space-y-3" aria-label="Review History"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Review History</h2><Button variant="outline" size="sm" onClick={load}>Refresh history</Button></div>
    {loading&&<p role="status">Loading saved corrections…</p>}{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    {!loading&&!error&&!rows.length&&<p className="text-sm text-muted-foreground">No saved corrections.</p>}
    <ul className="divide-y">{rows.map(r=><li key={r.id} className="space-y-2 py-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium">{r.label}</p><p className="text-xs text-muted-foreground">{r.date.slice(0,10)} · {r.undone?'Restored':'Saved correction'}</p></div>{!r.undone&&<Button size="sm" variant="outline" onClick={()=>setPending(r)}>Review undo</Button>}</div><details><summary className="cursor-pointer text-sm">Saved changes</summary><ul className="space-y-1 py-2 text-xs [overflow-wrap:anywhere]">{r.lines.map((line,i)=><li key={i}>{line}</li>)}</ul></details></li>)}</ul>
    <Dialog open={!!pending} onOpenChange={v=>{if(!v)setPending(null);}}><DialogContent className="max-h-[85dvh] w-[calc(100vw-1.5rem)] overflow-y-auto"><DialogHeader><DialogTitle>Confirm correction restoration</DialogTitle><DialogDescription>Later edits block restoration rather than being overwritten.</DialogDescription></DialogHeader><ul className="space-y-2 text-sm [overflow-wrap:anywhere]">{pending?.lines.map((line,i)=><li key={i}>{line}</li>)}</ul><div className="sticky bottom-0 grid grid-cols-2 gap-2 border-t bg-background py-2 [&_button]:min-h-11"><Button variant="outline" onClick={()=>setPending(null)}>Cancel</Button><Button onClick={async()=>{if(!pending)return;try{await pending.undo();setPending(null);await load();toast.success('Original values restored. Remaining issues stay in review.');}catch(e){toast.error(e instanceof Error?e.message:'Restoration failed');}}}>Confirm undo</Button></div></DialogContent></Dialog>
  </section>;
}