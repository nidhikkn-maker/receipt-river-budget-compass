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
import { MutualFundTools } from "./MutualFundTools";
import { BankBalanceEditor } from "./BankBalanceEditor";
import { BelongsTo } from "./BelongsTo";
import { ArchivedTableRecords, TableArchiveButton } from "./ArchivedRecords";
import { splitByTableArchive } from "@/lib/records-archive";
import { ValueDialog } from "./ValueDialog";
import { accountNameProblem, statementBalanceProblem } from "@/lib/value-edits";
export function AccountTools({ a }: { a: Account }) {
 const { accounts, transactions, valuations, addValuation, adjustBalance, updateAccount, preferences } = useStore();
 // No delete: a valuation is archived and still used for the value; a newer dated valuation corrects it (P0-014).
 const { active: shownValuations, archived: archivedValuations } = splitByTableArchive(preferences, "asset_valuations", valuations.filter(x=>x.accountId===a.id));
 const [value,setValue]=useState(""); const [date,setDate]=useState(todayISO()); const [source,setSource]=useState("manual"); const [busy,setBusy]=useState(false);
 // Rename and statement-balance edits use in-app dialogs (were browser pop-ups); the same store calls save them.
 const [edit,setEdit]=useState<"name"|"balance"|null>(null);
 const run=async(fn:()=>Promise<unknown>)=>{setBusy(true);try{await fn();toast.success("Saved");}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}};
 const valued=VALUED_KINDS.includes(a.kind); const v=accountValue(a,transactions,valuations,todayISO());
 return <details className="mt-3 border-t pt-2"><summary className="cursor-pointer text-sm font-medium">{valued?"Valuations & history":"Balance & account settings"}</summary>
 <div className="mt-3 grid gap-3"><BelongsTo accountId={a.id}/><div className="text-xs text-muted-foreground">Statement-matched balance: {money(reconciledBalance(a,transactions))}{v.valuedOn&&` · latest value ${v.valuedOn} (${v.source})`}</div>
 <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={()=>setEdit("name")}>Rename account</Button>{!["savings","current","cash","wallet"].includes(a.kind)&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>setEdit("balance")}>Adjust to statement balance</Button>}</div>
 <ValueDialog open={edit==="name"} title="Rename account" label="Account name" initialValue={a.name} confirmLabel="Save name"
  hint="Only the name changes; entries and balances stay as they are."
  validate={v=>accountNameProblem(v,a,accounts)} onSubmit={async v=>{await updateAccount(a.id,{name:v});toast.success("Saved");}} onClose={()=>setEdit(null)}/>
 <ValueDialog open={edit==="balance"} title="Adjust to statement balance" label="Actual balance shown on your statement (₹)" inputMode="decimal" confirmLabel="Adjust balance"
  description={`If it differs from ${a.name}'s balance here, one adjustment entry dated today makes them match.`}
  validate={statementBalanceProblem} onSubmit={async v=>{await adjustBalance(a,Number(v),todayISO());toast.success("Saved");}} onClose={()=>setEdit(null)}/>
 {["savings","current","cash","wallet"].includes(a.kind)&&<BankBalanceEditor account={a}/>}
 {["savings","current","cash","wallet"].includes(a.kind)&&<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={a.includeInCash!==false} onChange={e=>void run(()=>updateAccount(a.id,{includeInCash:e.target.checked}))}/>Include in available cash</label>}
 {valued&&<><div className="grid gap-2 sm:grid-cols-3"><div><Label htmlFor={`value-${a.id}`}>Market value (₹)</Label><Input id={`value-${a.id}`} type="number" min="0" step="0.01" value={value} onChange={e=>setValue(e.target.value)}/></div><div><Label htmlFor={`value-date-${a.id}`}>Valuation date</Label><Input id={`value-date-${a.id}`} type="date" max={todayISO()} value={date} onChange={e=>setDate(e.target.value)}/></div><div><Label>Source</Label><Select value={source} onValueChange={setSource}><SelectTrigger aria-label={`Valuation source for ${a.name}`}><SelectValue/></SelectTrigger><SelectContent>{["manual","statement","broker"].map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div></div>
 <Button size="sm" disabled={busy||!value} onClick={()=>void run(async()=>{await addValuation({accountId:a.id,value:Number(value),valuedOn:date,source});setValue("");})}>Save valuation</Button>
 <ul className="divide-y">{shownValuations.map(x=><li key={x.id} className="flex items-center justify-between gap-2 py-2 text-xs"><span>{x.valuedOn} · {money(x.value)} · {x.source}</span>{x.id&&<TableArchiveButton table="asset_valuations" id={x.id} name={`${a.name} ${x.valuedOn} ${money(x.value)}`} noun="valuation" />}</li>)}</ul>
 <p className="text-[11px] text-muted-foreground">To correct a value, save a newer valuation; the latest date is used.</p>
 <ArchivedTableRecords table="asset_valuations" rows={archivedValuations} noun="valuation" plain title={`Archived valuations (${archivedValuations.length}) · still used for the value`} nameOf={(x)=>`${a.name} ${x.valuedOn} ${money(x.value)}`} describe={(x)=>`${x.source}${x.note?` · ${x.note}`:""}`} /></>}
 {a.kind==="investment"&&<MutualFundTools account={a}/>}
 </div></details>;
}
