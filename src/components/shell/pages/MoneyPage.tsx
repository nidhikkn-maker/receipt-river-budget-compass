import { Link } from "@tanstack/react-router";
import { ArrowRight, CircleDot, Columns2, CreditCard, Gem, House, Inbox, Plane } from "lucide-react";
import { useStore } from "@/lib/store";
import { money } from "@/lib/expenses";
import { loadFailed } from "@/lib/load-state";
import { isLiability, type AccountKind } from "@/lib/ledger";
import { usePosition } from "@/lib/use-position";
import { useReviewView } from "@/lib/use-review-view";
import { ModuleRow, PageHeader } from "../PageHeader";
import { SplitView } from "../SplitView";
import { EmptyState, ErrorState } from "../States";
import { shortDate, useAttention } from "../shell-facts";

const KIND: Record<AccountKind, string> = {
  savings: "Savings account", current: "Current account", cash: "Cash", credit_card: "Credit card", wallet: "Wallet", investment: "Investment",
  fixed_deposit: "Fixed deposit", loan: "Loan", other_asset: "Money others owe me", other_liability: "Money I owe",
};
const BANK = ["savings", "current", "cash", "wallet"];
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * C01 Money hub (capture 03): account-first. Rows open today's pages; the account list below uses the
 * list/detail template so the chosen account stays beside the list on iPad and computer.
 */
export function SignatureMoney() {
  const { accounts, transactions, preferences, loadErrors, refresh } = useStore();
  const pos = usePosition(30);
  const attention = useAttention();
  const [selected, setSelected] = useReviewView<string | null>("sf-money-account", null);
  const live = accounts.filter((a) => !a.archived);
  const bank = pos.accounts.filter((a) => BANK.includes(a.kind));
  const cards = pos.cards;
  const invest = pos.accounts.filter((a) => a.kind === "investment" || a.kind === "fixed_deposit");
  const assets = (preferences.assets ?? []).filter((a) => !a.soldOn).length + (preferences.books?.properties ?? []).length;
  const trips = preferences.trips.length;
  const cardDue = cards.reduce((s, c) => s + Math.max(0, c.due), 0);
  const failed = loadFailed(loadErrors, "accounts");
  const items = pos.accounts.map((a) => ({ id: a.id, title: a.name, detail: `${KIND[a.kind]}${a.valuedOn ? ` · ${shortDate(a.valuedOn)}` : ""}`, trailing: <span className="financial-amount">{money(a.balance)}{a.liability ? " owed" : ""}</span> }));
  const detail = (id: string) => {
    const a = pos.accounts.find((x) => x.id === id);
    const acc = live.find((x) => x.id === id);
    if (!a || !acc) return <EmptyState title="This account is no longer active" hint="It may have been archived. Archived accounts stay in Accounts & investments." />;
    const recent = transactions.filter((t) => t.accountId === id || t.toAccountId === id).sort((x, y) => y.date.localeCompare(x.date)).slice(0, 5);
    return (
      <div className="sf-detail">
        <p className="sf-overline">{KIND[a.kind]}{acc.lastFour ? ` · •••• ${acc.lastFour}` : ""}</p>
        <h3 className="sf-detail-title">{a.name}</h3>
        <p className="sf-detail-figure financial-amount">{money(a.balance)}</p>
        <p className="sf-state-hint">{isLiability(a.kind) ? "Owed" : "Balance"} from recorded entries{a.valuedOn ? ` · valued ${shortDate(a.valuedOn)}` : ""}{a.valuationSource ? ` · ${a.valuationSource}` : ""}. Not a live bank balance.</p>
        <h4 className="sf-overline mt-5">Latest entries</h4>
        {recent.length ? <ul className="sf-rows">{recent.map((t) => <li key={t.id} className="sf-list-row"><span className="min-w-0 flex-1"><b className="block truncate">{t.merchant || t.title}</b><small>{shortDate(t.date)}</small></span><span className="sf-row-amount financial-amount">{money(t.amount)}</span></li>)}</ul>
          : <p className="sf-state-hint">No entries on this account yet.</p>}
        <div className="sf-detail-actions">
          {a.kind === "credit_card" ? <Link to="/cards/$accountId" params={{ accountId: id }} className="sf-btn sf-btn-deep">Open card<ArrowRight aria-hidden /></Link>
            : <Link to="/wealth" className="sf-btn sf-btn-deep">Open in Accounts<ArrowRight aria-hidden /></Link>}
          <Link to="/expenses" className="sf-btn sf-btn-outline">All activity</Link>
        </div>
      </div>
    );
  };

  return (
    <div className="sf-page">
      <PageHeader overline="All your finances" title="Your money, connected." description="The account is the starting point. Every expense, card payment, investment, asset and property leads back to its source record." />
      <p className="sf-note"><CircleDot aria-hidden />Balances come from your recorded entries · market prices are dated · properties and assets are counted once</p>
      {failed && <ErrorState what="your accounts" onRetry={refresh} className="mb-6" />}
      <div className="sf-module-grid">
        <ModuleRow to="/wealth" icon={<Columns2 />} title="Bank accounts" detail={bank.length ? `${plural(bank.length, "account")} · ${money(pos.cash)} available` : "Balances, statements, reconciliation and transfers"} />
        <ModuleRow to="/wealth" icon={<CreditCard />} title="Cards & payments" detail={cards.length ? `${plural(cards.length, "card")} · ${money(cardDue)} owed` : "Bills, transactions, due dates and settlements"} />
        <ModuleRow to="/wealth" hash="investments" icon={<Gem />} title="Investments & net worth" detail={invest.length ? `${plural(invest.length, "holding account")} · dated valuations` : "Demat holdings, funds, gains and dated valuations"} />
        <ModuleRow to="/assets" icon={<House />} title="Assets & properties" detail={assets ? `${plural(assets, "item")} on record` : "Owners, companies, accounts and locations"} />
        <ModuleRow to="/trips" icon={<Plane />} title="Trips & reimbursements" detail={trips ? `${plural(trips, "trip")} · ${plural(pos.reimbursements.pendingCount, "claim")} open` : "Trip finance, receipts, refunds and unsettled claims"} />
        <ModuleRow to="/inbox" icon={<Inbox />} title="Financial Inbox" detail={attention.total ? `${plural(attention.total, "item")} need a look` : "Only unmatched or uncertain records need review"} />
      </div>
      <div className="sf-actions-row"><Link to="/statements" className="sf-btn sf-btn-outline">Statement Desk & review<ArrowRight aria-hidden /></Link></div>

      <section aria-labelledby="sf-accounts-title" className="sf-section">
        <div className="sf-section-head"><h2 id="sf-accounts-title">Your accounts</h2><Link to="/wealth" className="sf-link">Manage accounts<ArrowRight aria-hidden /></Link></div>
        <SplitView label="Accounts" items={items} selectedId={selected} onSelect={setSelected} renderDetail={detail}
          empty={failed ? null : <EmptyState title="No accounts yet" hint="Add a bank account or card, or upload a statement and Thapal will suggest one." action={<Link to="/statements" className="sf-btn sf-btn-deep">Upload a statement</Link>} />} />
      </section>

      <section className="sf-band" aria-label="One connected record">
        <p><b>One connected record</b><span>Open a transaction to see its account, receipt, trip, company and books.</span></p>
        <Link to="/expenses" className="sf-btn sf-btn-outline">See your activity<ArrowRight aria-hidden /></Link>
      </section>
      <p className="sf-footnote">{live.length} active account{live.length === 1 ? "" : "s"} · figures are estimates from your records, never live bank feeds.</p>
    </div>
  );
}
