import { Link } from '@tanstack/react-router';
import { exportFile } from "@/lib/export-gate";
import { Button } from '@/components/ui/button';
import type { AuditItem } from '@/lib/books/audit';
import type { Expense } from '@/lib/expenses';
import type { VaultDoc } from '@/lib/documents';
import { reconciliationAnchor } from '@/lib/books/reconciliation-context';
import { reconciliationManifest, reconciliationManifestReport } from '@/lib/books/reconciliation-manifest';
import { toCsv, toExcel, toPdf } from '@/lib/reports';
import { useState } from 'react';

/** Existing audit treatment, exact records and existing review/download paths only. */
export function ReconciliationDetails({item,entries,docs,download}:{item:AuditItem;entries:Expense[];docs:VaultDoc[];download:(path:string,name:string)=>Promise<void>}){
 const c=item.comparison;
 const [pdf,setPdf]=useState<{blob:Blob;key:string}|null>(null);
 if(!c)return null;
 const report=()=>reconciliationManifestReport([item]);
 const key=JSON.stringify(c);
 const matchingAnchor=typeof window!=='undefined'&&(window.location.hash.slice(1)===reconciliationAnchor(item.key)||window.location.hash.slice(1)===encodeURIComponent(reconciliationAnchor(item.key)));
 return <details id={reconciliationAnchor(item.key)} className="mt-2 border-t pt-2" open={matchingAnchor}>
  <summary className="cursor-pointer text-xs font-medium">Compared records · {c.registration??c.recordId} · {item.fy??c.to}</summary>
  <div className="mt-2 space-y-3 text-xs">
   <p>{c.from} → {c.to} · difference {c.difference.toFixed(c.family==='investment'?6:2)}{c.family==='investment'?' units':' INR'}</p>
   {c.unresolved.map(u=><p key={u} className="text-destructive">{u}</p>)}
   {[c.left,c.right].map(side=><div key={side.label}><p className="font-semibold">{side.label} · {side.amount.toFixed(c.family==='investment'?6:2)}</p>
    {!side.inputs.length&&<p className="text-muted-foreground">No uniquely matched records</p>}
    <ul className="divide-y">{side.inputs.map((input,n)=><li key={`${input.kind}:${input.id}:${n}`} className="py-2"><span className="break-words">{input.label} · {input.date??'Undated'} · {input.amount.toFixed(c.family==='investment'?6:2)}</span>
     {input.kind==='entry'&&entries.some(e=>e.id===input.id)&&<Link to="/new" search={{edit:input.id}} className="ml-2 text-primary underline">Review entry</Link>}
     <div className="flex flex-wrap gap-2">{input.documentIds.map(id=>{const d=docs.find(d=>d.id===id);return d?<Button key={id} variant="link" size="sm" className="h-7 px-0 text-xs" onClick={()=>download(d.filePath,d.fileName)}>Original: {d.title}</Button>:<span key={id} className="text-destructive">Original unavailable</span>;})}
      {input.sourceRefs.filter(ref=>!input.documentIds.some(id=>docs.find(d=>d.id===id)?.filePath===ref)).map(ref=><span key={ref} className="break-all text-muted-foreground">{ref}</span>)}
     </div>
     {!input.documentIds.length&&!input.sourceRefs.length&&<p className="text-destructive">No retained original linked</p>}
    </li>)}</ul>
   </div>)}
   <div className="flex flex-wrap gap-2">
    <Button variant="outline" size="sm" onClick={()=>void exportFile({kind:'evidence'},new Blob([toCsv(report())],{type:'text/csv'}),'comparison-evidence.csv')}>CSV</Button>
    <Button variant="outline" size="sm" onClick={async()=>exportFile({kind:'evidence'},await toExcel(report()),'comparison-evidence.xlsx')}>Excel</Button>
    <Button variant="outline" size="sm" onClick={async()=>{if(pdf?.key===key)await exportFile({kind:'evidence'},pdf.blob,'comparison-evidence.pdf');else setPdf({blob:await toPdf(report(),`${item.entity} · FY ${item.fy??''} · saved-record comparison, not certification`),key});}}>{pdf?.key===key?'Download PDF':'Prepare PDF'}</Button>
    <Button variant="outline" size="sm" onClick={()=>void exportFile({kind:'evidence'},new Blob([JSON.stringify(reconciliationManifest([item]),null,2)],{type:'application/json'}),'comparison-manifest.json')}>Full evidence</Button>
   </div>
  </div>
 </details>;
}