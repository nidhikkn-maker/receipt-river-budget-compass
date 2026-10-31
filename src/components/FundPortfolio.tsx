import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { buildPortfolio, isNavValuation } from "@/lib/portfolio";
import { money } from "@/lib/expenses";
import { useStore } from "@/lib/store";
import { todayISO } from "@/lib/use-position";

const shortDate = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const compactMoney = (value: number) => {
  const abs = Math.abs(value);
  const [divisor, suffix] = abs >= 1e7 ? [1e7, "Cr"] as const : abs >= 1e5 ? [1e5, "L"] as const : abs >= 1e3 ? [1e3, "K"] as const : [1, ""] as const;
  return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }).format(value / divisor)}${suffix}`;
};
const signedMoney = (value: number) => `${value > 0 ? "+" : ""}${money(value)}`;
const config = {
  value: { label: "Portfolio value", color: "var(--chart-1)" },
  reference: { label: "Starting value + net flows", color: "var(--muted-foreground)" },
  gain: { label: "Gain since first NAV", color: "var(--success)" },
};

export function FundPortfolio() {
  const { accounts, transactions, valuations } = useStore();
  const today = todayISO();
  const [fund, setFund] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const available = accounts.filter(a => a.kind === "investment" && !a.archived && valuations.some(v => v.accountId === a.id && isNavValuation(v)));
  const selected = available.some(a => a.id === fund) ? fund : "all";
  const portfolio = useMemo(() => buildPortfolio(accounts, transactions, valuations, { asOf: today, from, to, ...(selected === "all" ? {} : { accountId: selected }) }), [accounts, transactions, valuations, today, from, to, selected]);
  const latest = portfolio.points.at(-1);
  const invalidRange = !!from && !!to && from > to;

  return <section aria-labelledby="fund-portfolio-title" className="mb-8 border-y py-6">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div><div className="mb-1 flex items-center gap-2 text-primary"><TrendingUp className="h-4 w-4" /><span className="text-xs font-semibold uppercase">Investments</span></div><h2 id="fund-portfolio-title" className="font-display text-2xl font-bold">Mutual fund portfolio</h2></div>
      {portfolio.latestDate && <p className="text-xs text-muted-foreground">Latest saved NAV · {portfolio.latestDate}</p>}
    </div>
    {!available.length ? <p className="py-6 text-sm text-muted-foreground">No saved mutual fund NAV valuations yet.</p> : <>
      <div className="mb-5 grid items-end gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
        <div className="grid min-w-0 gap-1"><Label>Fund</Label><Select value={selected} onValueChange={setFund}><SelectTrigger aria-label="Portfolio fund" className="w-full min-w-0"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All mutual funds</SelectItem>{available.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="grid gap-1"><Label htmlFor="portfolio-from">From</Label><Input id="portfolio-from" type="date" max={today} value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div className="grid gap-1"><Label htmlFor="portfolio-to">To</Label><Input id="portfolio-to" type="date" max={today} value={to} onChange={e => setTo(e.target.value)} /></div>
        <Button variant="outline" onClick={() => { setFrom(""); setTo(""); }} disabled={!from && !to}>All dates</Button>
      </div>
      {invalidRange ? <p role="alert" className="py-6 text-sm text-destructive">The end date must be on or after the start date.</p> : !latest ? <p className="py-6 text-sm text-muted-foreground">No saved NAV valuations in this period.</p> : <>
        <div className="mb-6 grid gap-4 border-b pb-5 sm:grid-cols-3">
          <div><p className="text-xs text-muted-foreground">Value at {latest.date}</p><p className="mt-1 break-words font-mono text-2xl font-semibold">{money(latest.value)}</p></div>
          <div><p className="text-xs text-muted-foreground">Gain since first saved NAV</p><p className={`mt-1 break-words font-mono text-2xl font-semibold ${latest.gain < 0 ? "text-destructive" : "text-success"}`}>{signedMoney(latest.gain)}</p></div>
          <div><p className="text-xs text-muted-foreground">Net money added since first NAV</p><p className="mt-1 break-words font-mono text-2xl font-semibold">{signedMoney(latest.netFlows)}</p></div>
        </div>
        <p className="mb-5 max-w-3xl text-xs text-muted-foreground">Gains are measured from each fund’s first saved NAV, after recorded money added or withdrawn—not lifetime returns or purchase-cost gains. Values carry forward between saved NAV dates; funds may have different NAV dates.</p>
        <div className="grid min-w-0 gap-6 xl:grid-cols-2">
          <div className="min-w-0"><h3 className="mb-2 font-semibold">Portfolio value</h3><ChartContainer config={config} className="h-64 w-full aspect-auto font-mono" aria-label="Dated mutual fund portfolio value chart">
            <LineChart accessibilityLayer data={portfolio.points} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" /><XAxis dataKey="date" tickFormatter={shortDate} minTickGap={35} /><YAxis width={58} tickFormatter={compactMoney} />
              <ChartTooltip content={<ChartTooltipContent labelFormatter={label => String(label)} formatter={(value, name) => <span>{config[name as keyof typeof config]?.label}: {money(Number(value))}</span>} />} />
              <Line type="stepAfter" dataKey="reference" stroke="var(--color-reference)" strokeDasharray="4 4" dot={false} isAnimationActive={false} />
              <Line type="stepAfter" dataKey="value" stroke="var(--color-value)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
            </LineChart>
          </ChartContainer><p className="mt-2 text-xs text-muted-foreground">Solid: value · Dashed: starting value + net flows</p></div>
          <div className="min-w-0"><h3 className="mb-2 font-semibold">Gains over time</h3><ChartContainer config={config} className="h-64 w-full aspect-auto font-mono" aria-label="Dated mutual fund gain chart">
            <LineChart accessibilityLayer data={portfolio.points} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" /><XAxis dataKey="date" tickFormatter={shortDate} minTickGap={35} /><YAxis width={58} tickFormatter={compactMoney} />
              <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
              <ChartTooltip content={<ChartTooltipContent labelFormatter={label => String(label)} formatter={value => <span>Gain: {signedMoney(Number(value))}</span>} />} />
              <Line type="stepAfter" dataKey="gain" stroke="var(--color-gain)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
            </LineChart>
          </ChartContainer></div>
        </div>
        <h3 className="mb-2 mt-6 font-semibold">Fund breakdown</h3>
        <div className="divide-y">{portfolio.holdings.map(h => <div key={h.accountId} className="grid items-center gap-2 py-3 sm:grid-cols-[2fr_1fr_1fr]">
          <div className="min-w-0"><p className="break-words font-medium">{h.name}</p><p className="text-xs text-muted-foreground">First NAV {h.firstDate} · latest {h.latestDate}</p></div>
          <p className="font-mono text-sm"><span className="mr-2 font-sans text-xs text-muted-foreground sm:hidden">Value</span>{money(h.value)}</p>
          <p className={`font-mono text-sm ${h.gain < 0 ? "text-destructive" : "text-success"}`}><span className="mr-2 font-sans text-xs text-muted-foreground">Gain</span>{signedMoney(h.gain)}</p>
        </div>)}</div>
        <details className="mt-4 border-t pt-3"><summary className="cursor-pointer text-sm font-medium">Dated portfolio history</summary><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><caption className="sr-only">Portfolio values and gains at saved NAV and ledger dates</caption><thead><tr className="border-b"><th className="py-2 pr-4">Date</th><th className="py-2 pr-4">Value</th><th className="py-2 pr-4">Net flows</th><th className="py-2">Gain</th></tr></thead><tbody>{portfolio.points.map(p => <tr key={p.date} className="border-b"><td className="whitespace-nowrap py-2 pr-4">{p.date}</td><td className="whitespace-nowrap py-2 pr-4 font-mono">{money(p.value)}</td><td className="whitespace-nowrap py-2 pr-4 font-mono">{signedMoney(p.netFlows)}</td><td className="whitespace-nowrap py-2 font-mono">{signedMoney(p.gain)}</td></tr>)}</tbody></table></div></details>
      </>}
    </>}
  </section>;
}