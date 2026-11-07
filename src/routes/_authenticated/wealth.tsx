import { AccountingDetails } from "@/components/AccountingDetails";
import { PLAIN_ACCOUNT_LABEL, accountKindNote } from "@/lib/plain-language";
import { PaymentMethodsManager } from "@/components/PaymentMethodsManager";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Archive, ArchiveRestore } from "lucide-react";
import { Stat } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ACCOUNT_KINDS, ACCOUNT_LABEL, accountValue, isLiability, type AccountKind } from "@/lib/ledger";
import { AccountForm } from "@/components/AccountForm";
import { AccountTools } from "@/components/AccountTools";
import { money } from "@/lib/expenses";
import { useStore } from "@/lib/store";
import { CardDetails, GoalsPanel, LoansPanel } from "@/components/WealthPanels";
import { FundPortfolio } from "@/components/FundPortfolio";
import { DematHoldings } from "@/components/DematHoldings";
import { MarketPanel } from "@/components/books/MarketPanel";
import { useNetWorth } from "@/components/books/useBooks";
import { ChevronRight, Scale, LineChart, Target, CalendarRange } from "lucide-react";
import band from "@/assets/companion-wealth-band.jpg";

export const Route = createFileRoute("/_authenticated/wealth")({
  head: () => ({
    meta: [
      { title: "Wealth & accounts — Ledgerline" },
      { name: "description", content: "Track accounts, net worth and dated mutual fund portfolio values and gains." },
      { property: "og:title", content: "Wealth & accounts — Ledgerline" },
      { property: "og:description", content: "Track accounts, net worth and dated mutual fund portfolio values and gains." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Wealth,
});

function Wealth() {
  const { accounts, transactions, valuations, setArchived, updateAccount, loans, preferences, goals, commitments } = useStore();
  const [showArchived, setShowArchived] = useState(false);
  // Same net worth as Home: each account, holding, property and loan counted once [v6.1 §9].
  const canonical = useNetWorth();
  const nw = { assets: canonical.assets.reduce((s, a) => s + a.value, 0), liabilities: canonical.liabilities, net: canonical.net };
  const list = accounts.filter((a) => showArchived || !a.archived);


  return (
    <div className="journal-wealth uix-family-money">
      <section className="cmp-band" aria-label="Wealth & Plan"><img src={band} alt="" width={1792} height={640} /><header className="cmp-page-head"><h1 className="cmp-serif">Wealth & Plan</h1><p>What you own, what you're working towards.</p></header></section>
      <nav aria-label="Wealth sections" className="cmp-list cmp-wealth-grid -mt-6 relative mb-8 gap-3">
        <a href="#net-worth" className="cmp-list-row"><span className="cmp-icon"><Scale /></span><span className="min-w-0 flex-1"><b>Net Worth</b><small>What you own minus what you owe</small></span><span className="cmp-amount">{money(nw.net)}</span><ChevronRight /></a>
        <a href="#investments" className="cmp-list-row"><span className="cmp-icon"><LineChart /></span><span className="min-w-0 flex-1"><b>Investments</b><small>Funds, shares and deposits</small></span><span className="cmp-amount">{canonical.portfolio ? money(canonical.portfolio) : "None yet"}</span><ChevronRight /></a>
        <a href="#goals" className="cmp-list-row"><span className="cmp-icon"><Target /></span><span className="min-w-0 flex-1"><b>Goals</b><small>{goals.length ? `${money(goals.reduce((t, g) => t + (g.saved ?? 0), 0))} saved so far` : "Set something to save for"}</small></span><span className="cmp-amount">{goals.length ? `${goals.length} ${goals.length === 1 ? "goal" : "goals"}` : "Add"}</span><ChevronRight /></a>
        <Link to="/plan" className="cmp-list-row"><span className="cmp-icon"><CalendarRange /></span><span className="min-w-0 flex-1"><b>Plan & Forecast</b><small>Bills ahead and how cash looks</small></span><span className="cmp-amount">{commitments.length ? `${commitments.length} planned` : "Start a plan"}</span><ChevronRight /></Link>
      </nav>
      <h2 id="net-worth" className="cmp-serif mb-3 scroll-mt-24 text-xl">The details</h2>
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="What I own" value={money(nw.assets)} />
        <Stat label="What I owe" value={money(nw.liabilities)} />
        <Stat label="My total financial position" value={money(nw.net)} />
      </div>
      <p className="-mt-3 mb-4 text-xs text-muted-foreground">What I own includes money available, investments and property at their latest recorded value. What I owe is card dues and loans. Your total position is the difference — it isn't cash you can spend today.</p>
      <AccountingDetails terms={['cashBalance','investments','liabilities','netWorth']} />
      {canonical.quality.length > 0 && <p className="mb-5 text-xs text-destructive">{canonical.quality.join(' · ')}</p>}
      <div id="investments" className="scroll-mt-24" />
      <FundPortfolio />
      <DematHoldings />
      <MarketPanel />
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <section className="min-w-0 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Your accounts</h2>
            <Button variant="ghost" size="sm" onClick={() => setShowArchived((v) => !v)}>{showArchived ? "Hide archived" : "Show archived"}</Button>
          </div>
          {!list.length && <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">No accounts yet. Add your bank, cards and cash to track balances.</p>}
          {list.map((a) => {
            const bal = accountValue(a, transactions, valuations).value;
            return (
              <div key={a.id} className={"rounded-2xl border bg-card p-4 " + (a.archived ? "opacity-60" : "")}>
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{a.name}</div>
                  <div className="text-xs text-muted-foreground">{PLAIN_ACCOUNT_LABEL[a.kind]} · {accountKindNote(a.kind)}{(() => { const eid = Object.entries(preferences.books?.entityAccounts ?? {}).find(([, ids]) => ids.includes(a.id))?.[0]; const n = eid && (preferences.entities ?? []).find((x) => x.id === eid)?.name; return n ? ` · ${n}` : ""; })()}</div>
                </div>
                <div className="font-mono">{money(bal)}</div>
                <Button variant="ghost" size="icon" aria-label={a.archived ? `Restore ${a.name}` : `Archive ${a.name}`}
                  onClick={() => setArchived(a.id, !a.archived).catch((e) => toast.error(e.message))}>
                  {a.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                </Button>
              </div>
              {a.kind === "credit_card" && !a.archived && <CardDetails a={a} />}
              {a.kind === "credit_card" && <Link to="/cards/$accountId" params={{ accountId: a.id }} className="mt-2 inline-block text-sm font-medium text-primary underline">View card balance & payments</Link>}
              {!a.archived && <AccountTools a={a} />}
              {!a.archived && ["savings","current","cash","wallet","credit_card"].includes(a.kind) && (
                <details className="mt-2 border-t pt-2"><summary className="cursor-pointer text-xs font-semibold text-muted-foreground">Linked UPI IDs & cards ({preferences.paymentInstruments.filter(p=>p.accountId===a.id&&!p.archived).length})</summary><div className="mt-2"><PaymentMethodsManager accountId={a.id} /></div></details>
              )}
              {(a.kind === "savings" || a.kind === "current") && !a.archived && (
                <label className="mt-2 flex items-center gap-2 border-t pt-2 text-xs text-muted-foreground">Keep at least ₹
                  <input type="number" defaultValue={a.minBalance ?? 0} aria-label={`Minimum balance for ${a.name}`} className="w-24 rounded-md border bg-background px-2 py-1 font-mono"
                    onBlur={(e) => updateAccount(a.id, { minBalance: Number(e.target.value) || 0 }).catch((er) => toast.error(er.message))} />
                </label>
              )}
              </div>
            );
          })}
        </section>

        <details className="uix-account-create border-t pt-4"><summary className="font-medium">Add an account</summary><div className="pt-4"><AccountForm /></div></details>
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <LoansPanel />
        <div id="goals" className="scroll-mt-24"><GoalsPanel /></div>
      </div>
    </div>
  );
}
