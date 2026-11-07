import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageTitle } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import { money } from "@/lib/expenses";
import { todayISO } from "@/lib/use-position";
import { searchAll, type SearchHit } from "@/lib/search";
import { Search as SearchIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/search")({
  head: () => ({
    meta: [
      { title: "Search everything — Ledgerline" },
      { name: "description", content: "Search all your financial records in plain language: transactions, accounts, documents, loans, payments and reimbursements." },
      { property: "og:title", content: "Search everything — Ledgerline" },
      { property: "og:description", content: "Search all your financial records in plain language." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SearchPage,
});

const EXAMPLES = [
  "Show all hotel expenses from the last six months",
  "Find payments above ₹25,000 using AMEX",
  "Show expenses tagged MOVAC",
  "Find all pending reimbursements",
  "Show all payments made to Swiggy",
  "Find my insurance documents",
  "Show recurring payments due next month",
];

const KIND_LABEL: Record<SearchHit["kind"], string> = {
  transaction: "Transactions", account: "Accounts & cards", commitment: "Scheduled payments", loan: "Loans", document: "Documents & receipts", goal: "Goals",
};

function SearchPage() {
  const { transactions, accounts, commitments, loans, documents, goals } = useStore();
  const today = todayISO();
  const [q, setQ] = useState("");
  const hits = useMemo(() => searchAll(q, { transactions, accounts, commitments, loans, documents, goals }, today), [q, transactions, accounts, commitments, loans, documents, goals, today]);
  const groups = useMemo(() => {
    const g = new Map<SearchHit["kind"], SearchHit[]>();
    for (const h of hits) g.set(h.kind, [...(g.get(h.kind) ?? []), h]);
    return [...g.entries()];
  }, [hits]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle eyebrow="Activity" title="Search everything" sub="Ask in plain language — search covers transactions, accounts, merchants, categories, tags, receipts, documents, cards, loans, scheduled payments and reimbursements." />
      <div className="relative mb-3">
        <SearchIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Try: hotel expenses from the last six months…" aria-label="Search all records" className="h-12 rounded-2xl pl-10 text-base" />
      </div>
      {!q && (
        <div className="mb-6 flex flex-wrap gap-2">
          {EXAMPLES.map((x) => <button key={x} onClick={() => setQ(x)} className="rounded-full border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-gold hover:text-foreground">{x}</button>)}
        </div>
      )}
      {q && !hits.length && <p className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">Nothing matched. Try different words, an amount (“above ₹5,000”), a period (“last month”), a tag or a merchant name.</p>}
      {groups.map(([kind, rows]) => (
        <section key={kind} className="mb-4 rounded-3xl border bg-card p-4">
          <h2 className="mb-2 font-display text-base font-bold">{KIND_LABEL[kind]} <span className="text-sm font-normal text-muted-foreground">({rows.length})</span></h2>
          <ul className="divide-y">
            {rows.map((h) => (
              <li key={`${h.kind}-${h.id}`}>
                <Link to={h.to} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0"><span className="block truncate font-semibold">{h.title}</span><span className="block text-xs text-muted-foreground">{h.detail}</span></span>
                  {h.amount != null && <span className="shrink-0 font-mono font-semibold">{money(h.amount)}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
