import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Archive, ArchiveRestore } from "lucide-react";
import { PageTitle, Stat } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ACCOUNT_KINDS, ACCOUNT_LABEL, accountBalance, isLiability, netWorth, type AccountKind } from "@/lib/ledger";
import { money } from "@/lib/expenses";
import { useStore } from "@/lib/store";
import { CardDetails, GoalsPanel, LoansPanel } from "@/components/WealthPanels";

export const Route = createFileRoute("/_authenticated/wealth")({
  head: () => ({
    meta: [
      { title: "Wealth & accounts — Ledgerline" },
      { name: "description", content: "Bank accounts, cards, cash and net worth in one place." },
      { property: "og:title", content: "Wealth & accounts — Ledgerline" },
      { property: "og:description", content: "Bank accounts, cards, cash and net worth in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Wealth,
});

function Wealth() {
  const { accounts, transactions, addAccount, setArchived, updateAccount, loans } = useStore();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AccountKind>("savings");
  const [opening, setOpening] = useState("0");
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const live = accounts.filter((a) => !a.archived);
  const nwRaw = netWorth(live, transactions);
  const loanOwed = loans.reduce((s, l) => s + l.principal, 0);
  const nw = { assets: nwRaw.assets, liabilities: nwRaw.liabilities + loanOwed, net: nwRaw.net - loanOwed };
  const list = accounts.filter((a) => showArchived || !a.archived);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await addAccount({ name, kind, openingBalance: Number(opening) });
      setName(""); setOpening("0");
      toast.success("Account added");
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  };

  return (
    <>
      <PageTitle eyebrow="Wealth" title="Accounts & net worth" sub="Balances come straight from your recorded entries." />
      <div className="mb-6 grid grid-cols-3 gap-3">
        <Stat label="Assets" value={money(nw.assets)} />
        <Stat label="Owed" value={money(nw.liabilities)} />
        <Stat label="Net worth" value={money(nw.net)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Your accounts</h2>
            <button className="text-xs text-muted-foreground underline" onClick={() => setShowArchived((v) => !v)}>{showArchived ? "Hide archived" : "Show archived"}</button>
          </div>
          {!list.length && <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">No accounts yet. Add your bank, cards and cash to track balances.</p>}
          {list.map((a) => {
            const bal = accountBalance(a, transactions);
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

        <form onSubmit={add} className="grid content-start gap-3 rounded-3xl border bg-card p-5">
          <h2 className="font-display text-lg font-bold">Add account</h2>
          <div className="grid gap-1"><Label htmlFor="an">Name</Label><Input id="an" placeholder="e.g. HDFC Savings, AMEX" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid gap-1">
            <Label>Type</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as AccountKind)}>
              <SelectTrigger aria-label="Account type"><SelectValue /></SelectTrigger>
              <SelectContent>{ACCOUNT_KINDS.map((k) => <SelectItem key={k} value={k}>{ACCOUNT_LABEL[k]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="ob">{isLiability(kind) ? "Amount owed today (₹)" : "Opening balance (₹)"}</Label>
            <Input id="ob" type="number" step="0.01" className="font-mono" value={opening} onChange={(e) => setOpening(e.target.value)} />
          </div>
          <Button type="submit" disabled={busy}>{busy ? "Adding…" : "Add account"}</Button>
        </form>
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <LoansPanel />
        <GoalsPanel />
      </div>
    </>
  );
}
