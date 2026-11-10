import { createFileRoute, Link } from "@tanstack/react-router";
import { PageTitle } from "@/components/AppShell";
import { LoadError } from "@/components/LoadError";
import { useStore } from "@/lib/store";
import { money } from "@/lib/expenses";
import { todayISO } from "@/lib/use-position";
import { loadFailed } from "@/lib/load-state";
import { emptyBooks } from "@/lib/books/types";
import { splitByTableArchive } from "@/lib/records-archive";
import { bankAccountDetail, isBankAccount } from "@/lib/bank-account-detail";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/bank-account/$accountId")({
  head: () => ({ meta: [
    { title: "Bank account — Thapal" },
    { name: "description", content: "One bank account: masked number, owner, statement freshness, running balance, recent entries and reconciliation." },
    { property: "og:title", content: "Bank account — Thapal" }, { property: "og:description", content: "Read-only bank account detail." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: BankAccountPage,
});

const TONE: Record<string, string> = { current: "text-success", needs_review: "text-warning", outdated: "text-destructive" };

function BankAccountPage() {
  const { accountId } = Route.useParams();
  const { accounts, transactions, preferences, documents, loadErrors, refresh } = useStore();
  const a = accounts.find((x) => x.id === accountId);
  const failed = loadFailed(loadErrors, "accounts", "transactions");
  const books = preferences.books ?? emptyBooks();
  if (!a || !isBankAccount(a)) return (
    <div className="mx-auto max-w-2xl space-y-4">
      <p className="text-sm"><Link to="/wealth" className="text-primary underline-offset-4 hover:underline">Accounts</Link></p>
      {failed ? <LoadError what="your accounts" onRetry={refresh} /> : <div className="rounded-2xl border border-dashed p-6 text-sm"><p className="font-medium">{a ? "This page is for bank, cash and wallet accounts." : "This account couldn't be found."}</p><p className="text-muted-foreground">{a ? "Cards and loans have their own pages." : "The link may be old. Nothing has been deleted."}</p></div>}
    </div>
  );
  const d = bankAccountDetail(a, { transactions, preferences, documents: splitByTableArchive(preferences, "documents", documents).active, entities: preferences.entities ?? [], entityAccounts: books.entityAccounts ?? {}, today: todayISO() });
  const facts: [string, string][] = [["Account number", d.masked], ["Bank", d.institution], ["Belongs to", d.owner], ["Status", a.archived ? "Archived" : "Active"]];
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <p className="text-sm"><Link to="/wealth" className="text-primary underline-offset-4 hover:underline">Accounts</Link> <span className="text-muted-foreground">/ {a.name}</span></p>
      <PageTitle eyebrow="Bank account" title={a.name} sub="Read-only. Balances are worked out from your entries; nothing here changes them." />
      {failed && <LoadError what="some entries" onRetry={refresh} note="The balance below may be incomplete until they load. Nothing has been deleted." />}
      <section aria-label="Balances" className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border bg-card p-4"><p className="text-xs text-muted-foreground">Balance from entries</p><p className="font-mono text-xl font-semibold">{money(d.balance)}</p><p className="text-xs text-muted-foreground">as of {d.freshness.lastEntry ?? "no entries yet"}</p></div>
        <div className="rounded-2xl border bg-card p-4"><p className="text-xs text-muted-foreground">Matched to statements</p><p className="font-mono text-xl font-semibold">{money(d.reconciledBalance)}</p><p className="text-xs text-muted-foreground">{d.reconciliation.matched} of {d.reconciliation.total} entries matched</p></div>
        <div className="rounded-2xl border bg-card p-4"><p className="text-xs text-muted-foreground">Statement freshness</p><p className={cn("text-xl font-semibold", TONE[d.freshness.status])}>{d.freshness.label}</p><p className="text-xs text-muted-foreground">Last checked {d.freshness.lastVerified?.slice(0, 10) ?? "never"}{d.freshness.lastImport ? ` · last import ${d.freshness.lastImport.slice(0, 10)}` : ""}</p></div>
      </section>
      <section aria-label="Account details" className="rounded-2xl border bg-card p-4">
        <dl className="divide-y text-sm">{facts.map(([k, v]) => <div key={k} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2 py-2"><dt className="text-muted-foreground">{k}</dt><dd className="break-words">{v}</dd></div>)}</dl>
      </section>
      <section aria-label="Reconciliation" className="rounded-2xl border bg-card p-4 text-sm">
        <h2 className="mb-1 font-semibold">Reconciliation</h2>
        <p>{d.reconciliation.statementBalance == null ? "No statement balance entered yet." : `Statement balance ${money(d.reconciliation.statementBalance)} on ${d.reconciliation.statementDate}${d.reconciliation.difference ? ` · difference ${money(d.reconciliation.difference)}` : " · agrees with your entries"}`}</p>
        <p className="text-muted-foreground">{d.reconciliation.action}</p>
        <div className="mt-2 flex flex-wrap gap-3"><Link to="/account-reconciliation" className="text-primary underline-offset-4 hover:underline">Check against a statement</Link><Link to="/statements" className="text-primary underline-offset-4 hover:underline">Upload a statement</Link></div>
      </section>
      <section aria-label="Statements" className="rounded-2xl border bg-card p-4 text-sm">
        <h2 className="mb-1 font-semibold">Statements on file ({d.statements.length})</h2>
        {d.statements.length ? <ul className="divide-y">{d.statements.slice(0, 12).map((s) => <li key={s.id} className="flex justify-between gap-2 py-1.5"><span className="min-w-0 break-words">{s.title}</span><span className="shrink-0 text-muted-foreground">{s.date ?? "No date"}</span></li>)}</ul> : <p className="text-muted-foreground">No statements filed for this account yet.</p>}
        <Link to="/vault" className="mt-1 inline-block text-primary underline-offset-4 hover:underline">Open DocuRepo</Link>
      </section>
      <section aria-label="Recent transactions" className="rounded-2xl border bg-card">
        <h2 className="border-b px-4 py-2 font-semibold">Recent transactions <span className="text-xs font-normal text-muted-foreground">· {Math.min(d.recent.length, d.totalEntries)} of {d.totalEntries}, newest first</span></h2>
        {!d.recent.length ? <p className="p-4 text-sm text-muted-foreground">{failed ? "Entries couldn't load." : "No entries on this account yet."}</p> : (
          <ul className="divide-y text-sm">{d.recent.map((r) => (
            <li key={r.entry.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-4 py-2">
              <span className="min-w-0"><span className="block truncate font-medium">{r.entry.merchant || r.entry.title}</span><span className="block text-xs text-muted-foreground">{r.entry.date} · {r.reconciled ? "Matched to statement" : "Not matched yet"}</span></span>
              <span className="text-right font-mono"><span className={cn("block", r.effect > 0 ? "text-success" : "")}>{r.effect > 0 ? "+" : r.effect < 0 ? "−" : ""}{money(Math.abs(r.effect))}</span><span className="block text-xs text-muted-foreground">bal {money(r.balanceAfter)}</span></span>
            </li>
          ))}</ul>
        )}
        <div className="border-t px-4 py-2 text-sm"><Link to="/expenses" className="text-primary underline-offset-4 hover:underline">See all entries</Link></div>
      </section>
    </div>
  );
}
