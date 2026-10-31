import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./ui/button";
import { useStore } from "@/lib/store";
import { occurrences, addDays, addMonths, monthEnd } from "@/lib/planning";
import { todayISO } from "@/lib/use-position";
import { money } from "@/lib/expenses";
import { cn } from "@/lib/utils";
export function PlanCalendar(){
 const {commitments,loans,documents,preferences}=useStore(); const [month,setMonth]=useState(todayISO().slice(0,7)+"-01"); const [selected,setSelected]=useState(todayISO());
 const end=monthEnd(month); const planned=occurrences(commitments,month,end,true).map(x=>({date:x.date,name:x.name,amount:x.amount,direction:x.direction}));
 for(const l of loans.filter(x=>x.status==="active")) {let d=l.nextDue;for(let n=0;n<1200&&d<=end;n++,d=addMonths(d,1)){if(d>=month)planned.push({date:d,name:l.name+" EMI",amount:l.emi,direction:"out"});}}
 for(const d of documents)if(d.expiresOn&&d.expiresOn>=month&&d.expiresOn<=end)planned.push({date:d.expiresOn,name:d.title+" expires",amount:0,direction:"out"});
 const first=(new Date(month+"T00:00:00Z").getUTCDay()+6)%7;
 const cells=Array.from({length:42},(_,i)=>addDays(month,i-first));
 return <section className="mb-6"><div className="mb-3 flex items-center justify-between"><h2 className="font-display text-lg font-bold">{new Date(month+"T00:00:00Z").toLocaleDateString("en",{month:"long",year:"numeric",timeZone:"UTC"})}</h2><div className="flex gap-1"><Button size="icon" variant="ghost" aria-label="Previous calendar month" onClick={()=>setMonth(addMonths(month,-1))}><ChevronLeft className="h-4 w-4"/></Button><Button size="sm" variant="ghost" onClick={()=>{setMonth(todayISO().slice(0,7)+"-01");setSelected(todayISO());}}>Today</Button><Button size="icon" variant="ghost" aria-label="Next calendar month" onClick={()=>setMonth(addMonths(month,1))}><ChevronRight className="h-4 w-4"/></Button></div></div>
 <div className="grid grid-cols-7 border-l border-t">{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d=><div key={d} className="border-b border-r p-2 text-center text-xs text-muted-foreground">{d}</div>)}{cells.map(date=>{const items=planned.filter(x=>x.date===date);return <Button key={date} variant="ghost" aria-label={`Calendar ${date}, ${items.length} items`} aria-pressed={selected===date} onClick={()=>setSelected(date)} className={cn("h-20 min-w-0 flex-col justify-start gap-1 rounded-none border-b border-r p-1 sm:h-24",!date.startsWith(month.slice(0,7))&&"text-muted-foreground",selected===date&&"bg-secondary",date===todayISO()&&"text-primary")}><span className="text-xs">{Number(date.slice(8))}</span>{items.length>0&&<><span className="text-[10px]">{items.length} due</span><span className="hidden max-w-full truncate text-[10px] sm:block">{items[0]?.name}</span></>}</Button>;})}</div>
 <div className="mt-3"><h3 className="text-sm font-medium">{selected}</h3><ul className="divide-y text-sm">{planned.filter(x=>x.date===selected).map((x,i)=><li key={i} className="flex justify-between gap-3 py-2"><span>{x.name}</span><span>{x.amount?`${x.direction==="in"?"+":"−"}${money(x.amount)}`:""}</span></li>)}</ul>{!planned.some(x=>x.date===selected)&&<p className="py-2 text-xs text-muted-foreground">Nothing due</p>}<p className="text-xs text-muted-foreground">Reminders begin {preferences.reminderDays} days before the due date.</p></div></section>;
}
