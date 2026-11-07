import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { useStore } from "@/lib/store";
import { getFundNav } from "@/lib/mutual-funds.functions";
import { fundHoldingValue, type FundQuote } from "@/lib/mutual-funds";
import type { Account } from "@/lib/ledger";
import { money } from "@/lib/expenses";

export function MutualFundTools({account}:{account:Account}) {
 const {addValuation} = useStore();
 const getNav = useServerFn(getFundNav);
 const [scheme,setScheme] = useState(account.details?.schemeCode ?? "");
 const [units,setUnits] = useState(String(account.details?.units ?? ""));
 const [quote,setQuote] = useState<FundQuote | null>(null);
 const [busy,setBusy] = useState(false);
 const [saved,setSaved] = useState(false);
 let value:number|null=null;
 try { if(quote) value=fundHoldingValue(Number(units),quote.nav); } catch { /* Invalid units disable saving. */ }
 const fetchNav=async()=>{
  setBusy(true);setQuote(null);setSaved(false);
  try {const result=await getNav({data:{schemeCode:scheme.trim()}});if(!result.ok)throw Error(result.error);setQuote(result.quote);}
  catch(e){toast.error((e as Error).message);}finally{setBusy(false);}
 };
 const save=async()=>{
  if(!quote || value===null)return;
  setBusy(true);
  try {await addValuation({accountId:account.id,value,valuedOn:quote.date,source:"MFapi / AMFI NAV",note:`${quote.schemeName} (${quote.schemeCode}); ${units} units × NAV ${quote.nav}`});setSaved(true);toast.success("NAV valuation saved");}
  catch(e){toast.error((e as Error).message);}finally{setBusy(false);}
 };
 return <section className="grid gap-3 border-t pt-3">
  <h3 className="text-sm font-semibold">Mutual fund NAV</h3>
  <div><Label htmlFor={`scheme-${account.id}`}>AMFI scheme code</Label><Input id={`scheme-${account.id}`} inputMode="numeric" value={scheme} onChange={e=>{setScheme(e.target.value);setQuote(null);setSaved(false);}}/></div>
  <Button variant="outline" size="sm" disabled={busy||!/^\d{5,8}$/.test(scheme.trim())} onClick={()=>void fetchNav()}><RefreshCw className={busy?"h-4 w-4 animate-spin":"h-4 w-4"}/>Fetch latest NAV</Button>
  {quote&&<>
   <p className="break-words text-sm font-medium">{quote.schemeName}</p>
   <p className="text-xs text-muted-foreground">NAV {money(quote.nav)} · published {quote.date} · MFapi / AMFI</p>
   <div><Label htmlFor={`units-${account.id}`}>Units held on {quote.date}</Label><Input id={`units-${account.id}`} type="number" min="0" step="any" value={units} onChange={e=>{setUnits(e.target.value);setSaved(false);}}/></div>
   <p className="font-mono text-sm">Holding value: {value===null?"—":money(value)}</p>
   <Button size="sm" disabled={busy||value===null||saved} onClick={()=>void save()}>{saved?"Valuation saved":"Save NAV valuation"}</Button>
  </>}
 </section>;
}