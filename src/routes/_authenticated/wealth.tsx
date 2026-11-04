import { PaymentMethodsManager } from "@/components/PaymentMethodsManager";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Archive, ArchiveRestore } from "lucide-react";
import { PageTitle, Stat } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ACCOUNT_KINDS, ACCOUNT_LABEL, accountValue, isLiability, netWorth, type AccountKind } from "@/lib/ledger";
import { AccountForm } from "@/components/AccountForm";
import { AccountTools } from "@/components/AccountTools";
import { money } from "@/lib/expenses";
import { useStore } from "@/lib/store";
import { CardDetails, GoalsPanel, LoansPanel } from "@/components/WealthPanels";
import { FundPortfolio } from "@/components/FundPortfolio";
import { DematHoldings } from "@/components/DematHoldings";

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
  const { accounts, transactions, valuations, setArchived, updateAccount, loans, preferences } = useStore();
  const [showArchived, setShowArchived] = useState(false);
  const live = accounts.filter((a) => !a.archived);
  const nwRaw = netWorth(live, transactions, valuations);
  // Loans with a linked account are already in the account balances; only count the rest here.
  const loanOwed = loans.filter((l) => !l.accountId && l.status !== "closed").reduce((s, l) => s + l.principal, 0);
  const nw = { assets: nwRaw.assets, liabilities: nwRaw.liabilities + loanOwed, net: nwRaw.net - loanOwed };
  const list = accounts.filter((a) => showArchived || !a.archived);


  return (
    <>
      <PageTitle eyebrow="Wealth" title="Accounts & net worth" sub="Balances come straight from your recorded entries." />
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Assets" value={money(nw.assets)} />
        <Stat label="Owed" value={money(nw.liabilities)} />
        <Stat label="Net worth" value={money(nw.net)} />
      </div>

      <FundPortfolio />
      <DematHoldings />
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
                  <div className="text-xs text-muted-foreground">{ACCOUNT_LABEL[a.kind]}{isLiability(a.kind) ? " · owed" : ""}</div>
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

        <AccountForm />
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <LoansPanel />
        <GoalsPanel />
      </div>
    </>
  );
}
