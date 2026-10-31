import { useState } from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { useStore } from "@/lib/store";
import { SCOPE_LABEL, CURRENCIES, money, type Scope } from "@/lib/expenses";
import { tripAllocationPlans, validatePlanAmount } from "@/lib/trip-planning";
import type { TravelTrip } from "@/lib/travel";

export function TripPlanFields({ trip }: { trip: TravelTrip }) {
  const { preferences, savePreferences, transactions, members } = useStore();
  const [workspace, setWorkspace] = useState<Scope>("personal");
  const [traveller, setTraveller] = useState("Me");
  const [currency, setCurrency] = useState("INR");
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("1");
  const plans = tripAllocationPlans(trip, transactions);
  const put = async (patch: Partial<TravelTrip>) => {
    try { await savePreferences({ ...preferences, trips: preferences.trips.map(t => t.id === trip.id ? { ...t, ...patch } : t) }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save trip plan"); }
  };
  const add = (kind: "workspace" | "traveller" | "currency") => {
    try { validatePlanAmount(Number(amount), kind === "currency" ? Number(rate) : 1); }
    catch (e) { toast.error((e as Error).message); return; }
    if (kind === "workspace") void put({ workspaceBudgets: [...(trip.workspaceBudgets ?? []).filter(x => x.workspace !== workspace), { workspace, amount: Number(amount) }] });
    if (kind === "traveller") void put({ travellerBudgets: [...(trip.travellerBudgets ?? []).filter(x => x.traveller !== traveller), { traveller, amount: Number(amount) }] });
    if (kind === "currency") void put({ currencyBudgets: [...(trip.currencyBudgets ?? []).filter(x => x.currency !== currency), { currency, amount: Number(amount), planningRate: Number(rate) }] });
  };
  const name = (id: string) => members.find(m => m.id === id)?.name ?? id;
  return <div className="mt-3 border-t pt-3">
    <div className="grid gap-3 sm:grid-cols-2">
      <div><Label htmlFor={`primary-${trip.id}`}>Primary workspace</Label><select id={`primary-${trip.id}`} disabled={!!trip.closedAt} className="h-10 w-full rounded-md border bg-background px-2" value={trip.primaryWorkspace ?? (trip.type === "mixed" ? "personal" : trip.type ?? "personal")} onChange={e => void put({ primaryWorkspace: e.target.value as Scope })}>{Object.entries(SCOPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div><Label htmlFor={`organisation-${trip.id}`}>Organisation</Label><Input id={`organisation-${trip.id}`} disabled={!!trip.closedAt} defaultValue={trip.organisation ?? ""} onBlur={e => { if (e.target.value !== trip.organisation) void put({ organisation: e.target.value.trim() }); }} /></div>
    </div>
    <h3 className="mt-4 text-sm font-semibold">Budget allocations</h3>
    {[...plans.workspace.map(x => ({ ...x, key: `Workspace · ${x.label}` })), ...plans.traveller.map(x => ({ ...x, key: `Traveller · ${name(x.label)}` }))].map(x => <div key={x.key} className="flex flex-wrap justify-between gap-2 border-b py-2 text-sm"><span>{x.key}</span><span className="font-mono">{money(x.budget)} plan · {money(x.actual)} spent · <span className={x.left < 0 ? "text-destructive" : ""}>{money(x.left)} left</span></span></div>)}
    {plans.currencies.map(x => <div key={x.currency} className="flex flex-wrap justify-between gap-2 border-b py-2 text-sm"><span>{x.currency} {x.amount.toLocaleString()} × {x.planningRate} planning rate</span><span className="font-mono">{money(x.inr)}</span></div>)}
    {!trip.closedAt && <div className="mt-3 grid gap-2 sm:grid-cols-3">
      <Input aria-label="Allocation budget amount" type="number" placeholder="Budget amount" value={amount} onChange={e => setAmount(e.target.value)} className="sm:col-span-3" />
      <select aria-label="Budget workspace" className="h-10 rounded-md border bg-background px-2" value={workspace} onChange={e => setWorkspace(e.target.value as Scope)}>{Object.entries(SCOPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><Button variant="outline" className="sm:col-span-2" onClick={() => add("workspace")}>Save workspace budget (₹)</Button>
      <select aria-label="Budget traveller" className="h-10 rounded-md border bg-background px-2" value={traveller} onChange={e => setTraveller(e.target.value)}><option value="Me">Me</option>{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}{(trip.travellers ?? []).filter(n => !members.some(m => m.name === n)).map(n => <option key={n}>{n}</option>)}</select><Button variant="outline" className="sm:col-span-2" onClick={() => add("traveller")}>Save traveller budget (₹)</Button>
      <select aria-label="Budget currency" className="h-10 rounded-md border bg-background px-2" value={currency} onChange={e => { setCurrency(e.target.value); if (e.target.value === "INR") setRate("1"); }}>{CURRENCIES.map(c => <option key={c}>{c}</option>)}</select><Input aria-label="Budget planning exchange rate" type="number" value={rate} onChange={e => setRate(e.target.value)} /><Button variant="outline" onClick={() => add("currency")}>Save currency budget</Button>
    </div>}
  </div>;
}