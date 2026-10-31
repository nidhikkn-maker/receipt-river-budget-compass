import { useState } from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { useStore } from "@/lib/store";
import { accountValue, reconciledBalance, VALUED_KINDS, type Account } from "@/lib/ledger";
import { money } from "@/lib/expenses";
import { todayISO } from "@/lib/use-position";
export function AccountTools({ a }: { a: Account }) {
 const { transactions, valuations, addValuation, removeValuation, adjustBalance, updateAccount } = useStore();
 const [value,setValue]=useState(""); const [date,setDate]=useState(todayISO()); const [source,setSource]=useState("manual"); const [busy,setBusy]=useState(false);
 const run=async(fn:()=>Promise<unknown>)=>{setBusy(true);try{await fn();toast.success("Saved");}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}};
 const valued=VALUED_KINDS.includes(a.kind); const v=accountValue(a,transactions,valuations,todayISO());
 return <details className="mt-3 border-t pt-2"><summary className="cursor-pointer text-sm font-medium">{valued?"Valuations & history":"Balance & account settings"}</summary>
 <div className="mt-3 grid gap-3"><div className="text-xs text-muted-foreground">Statement-matched balance: {money(reconciledBalance(a,transactions))}{v.valuedOn&&` · latest value ${v.valuedOn} (${v.source})`}</div>
 <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={()=>{const name=window.prompt("Account name",a.name);if(name)void run(()=>updateAccount(a.id,{name}));}}>Rename account</Button><Button size="sm" variant="outline" disabled={busy} onClick={()=>{const value=window.prompt("Actual balance shown on your statement (₹)");if(value!==null&&value.trim())void run(()=>adjustBalance(a,Number(value),todayISO()));}}>Adjust to statement balance</Button></div>
 {["savings","current","cash","wallet"].includes(a.kind)&&<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={a.includeInCash!==false} onChange={e=>void run(()=>updateAccount(a.id,{includeInCash:e.target.checked}))}/>Include in available cash</label>}
 {valued&&<><div className="grid gap-2 sm:grid-cols-3"><div><Label htmlFor={`value-${a.id}`}>Market value (₹)</Label><Input id={`value-${a.id}`} type="number" min="0" step="0.01" value={value} onChange={e=>setValue(e.target.value)}/></div><div><Label htmlFor={`value-date-${a.id}`}>Valuation date</Label><Input id={`value-date-${a.id}`} type="date" max={todayISO()} value={date} onChange={e=>setDate(e.target.value)}/></div><div><Label>Source</Label><Select value={source} onValueChange={setSource}><SelectTrigger aria-label={`Valuation source for ${a.name}`}><SelectValue/></SelectTrigger><SelectContent>{["manual","statement","broker"].map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div></div>
 <Button size="sm" disabled={busy||!value} onClick={()=>void run(async()=>{await addValuation({accountId:a.id,value:Number(value),valuedOn:date,source});setValue("");})}>Save valuation</Button>
 <ul className="divide-y">{valuations.filter(x=>x.accountId===a.id).map(x=><li key={x.id} className="flex items-center justify-between gap-2 py-2 text-xs"><span>{x.valuedOn} · {money(x.value)} · {x.source}</span><Button size="sm" variant="ghost" disabled={busy} onClick={()=>{if(x.id&&window.confirm("Delete this valuation?"))void run(()=>removeValuation(x.id as string));}}>Remove</Button></li>)}</ul></>}
 </div></details>;
}
