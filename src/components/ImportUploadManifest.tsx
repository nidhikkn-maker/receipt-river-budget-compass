import { useState } from 'react';
import { Upload, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '@/lib/store';
import { readStatement } from '@/lib/statement-import';
import { CURRENCIES } from '@/lib/expenses';
import { manifestBlockers,statementDateRange } from '@/lib/import-manifest';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from './ui/select';

export interface StatementUpload {id:string;file:File;accountId:string;currency:string;from:string;to:string;error?:string}
export function ImportUploadManifest({defaultAccount,defaultCurrency,busy,onUpload}:{defaultAccount:string;defaultCurrency:string;busy:boolean;onUpload:(files:StatementUpload[])=>Promise<Set<string>>}) {
  const {accounts}=useStore();const [files,setFiles]=useState<StatementUpload[]>([]),[reading,setReading]=useState(false),[confirmed,setConfirmed]=useState(false);
  const update=(id:string,patch:Partial<StatementUpload>)=>{setFiles(items=>items.map(item=>item.id===id?{...item,...patch}:item));setConfirmed(false);};
  const choose=async(chosen:File[])=>{
    setReading(true);setConfirmed(false);
    try{
      const next=await Promise.all(chosen.map(async file=>{
        const item:StatementUpload={id:crypto.randomUUID(),file,accountId:defaultAccount,currency:defaultCurrency,from:'',to:''};
        try{if(file.size>15*1024*1024)throw Error('Each statement must be under 15 MB');if(!/\.(csv|xls|xlsx|pdf)$/i.test(file.name))throw Error('Choose CSV, XLS, XLSX or PDF');if(!/\.pdf$/i.test(file.name)){const range=statementDateRange(await readStatement(file));item.from=range.from;item.to=range.to;}}
        catch(e){item.error=e instanceof Error?e.message:'Could not read statement';}return item;
      }));setFiles(items=>[...items,...next]);
    }finally{setReading(false);}
  };
  const blockers=(item:StatementUpload)=>manifestBlockers(item,accounts.filter(a=>!a.archived).map(a=>a.id),new Date().toISOString().slice(0,10));
  return <div className="space-y-4">
    <label className="inline-flex min-h-11 items-center gap-2 text-sm font-medium cursor-pointer text-primary"><Upload className="size-4"/>{reading?'Reading selected files…':'Choose statements'}<input type="file" multiple disabled={busy||reading} accept=".csv,.xls,.xlsx,.pdf" className="sr-only" aria-label="Historical statement files" onChange={e=>{const chosen=Array.from(e.target.files??[]);e.target.value='';void choose(chosen).catch(error=>toast.error(error.message));}}/></label>
    {!!files.length&&<><h3 className="font-medium">Review selected statements · {files.length}</h3><ul className="divide-y">{files.map((item,index)=><li key={item.id} className="space-y-3 py-4"><div className="flex items-start justify-between gap-3"><p className="min-w-0 break-words text-sm font-medium">{item.file.name} <span className="text-muted-foreground">· {(item.file.size/1024).toFixed(0)} KB</span></p><Button size="icon" variant="ghost" disabled={busy} aria-label={`Remove statement ${index+1}`} onClick={()=>{setFiles(items=>items.filter(f=>f.id!==item.id));setConfirmed(false);}}><Trash2 className="size-4"/></Button></div><div className="grid gap-3 sm:grid-cols-2"><Select disabled={busy} value={item.accountId} onValueChange={v=>update(item.id,{accountId:v})}><SelectTrigger aria-label={`Account for statement ${index+1}`}><SelectValue placeholder="Confirm account or card"/></SelectTrigger><SelectContent>{accounts.filter(a=>!a.archived).map(a=><SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select><Select disabled={busy} value={item.currency} onValueChange={v=>update(item.id,{currency:v})}><SelectTrigger aria-label={`Currency for statement ${index+1}`}><SelectValue/></SelectTrigger><SelectContent>{CURRENCIES.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select><label className="text-xs text-muted-foreground">Period start<Input disabled={busy} className="min-w-0" type="date" aria-label={`Period start for statement ${index+1}`} value={item.from} onChange={e=>update(item.id,{from:e.target.value})}/></label><label className="text-xs text-muted-foreground">Period end<Input disabled={busy} className="min-w-0" type="date" aria-label={`Period end for statement ${index+1}`} value={item.to} onChange={e=>update(item.id,{to:e.target.value})}/></label></div>{blockers(item).map(error=><p className="text-sm text-destructive break-words" key={error}>{error}</p>)}</li>)}</ul><p className="text-sm text-muted-foreground">Detected dates cover transaction rows, not necessarily the full statement period. PDF dates remain unconfirmed until extraction.</p><label className="flex items-start gap-2 text-sm"><input type="checkbox" aria-label="Confirmed each statement account and period" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/>I reviewed the account, currency and available dates for each statement.</label><Button loading={busy} disabled={!confirmed||reading||files.some(item=>blockers(item).length>0)} onClick={async()=>{const completed=await onUpload(files);setFiles(items=>items.filter(item=>!completed.has(item.id)));setConfirmed(false);}}>Confirm &amp; process {files.length} statements</Button></>}
  </div>;
}