import { Link } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { cleanBooks } from "@/lib/books/types";
import { depreciationExceptions, preparedSummary } from "@/lib/books/assets-ledger";
import { money } from "@/lib/expenses";

const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

/** Inbox card: depreciation prepared by the monthly run, waiting for the owner's approval. */
export function DepreciationInboxCard() {
  const { preferences, savePreferences } = useStore();
  const books = cleanBooks(preferences.books);
  const dismissed = new Set((preferences as { depreciationDismissed?: string[] }).depreciationDismissed ?? []);
  const groups = preparedSummary(books.journals).filter((g) => !dismissed.has(g.month));
  const blocked = (preferences.assets ?? []).filter((a) => a.kind !== "property" && !a.soldOn).map((a) => ({ a, x: depreciationExceptions(a) })).filter((r) => r.x.length);
  if (!groups.length) return null;
  const dismiss = (m: string) => savePreferences({ ...preferences, depreciationDismissed: [...dismissed, m].slice(-24) } as typeof preferences);
  return (
    <section aria-label="Depreciation ready" className="space-y-2 rounded-2xl border p-4">
      {groups.map((g) => <div key={g.month} className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="font-semibold">Depreciation ready for {monthName(g.month)}</p><p className="text-sm text-muted-foreground">{g.count} asset{g.count === 1 ? "" : "s"} · {money(g.total)} · prepared automatically, nothing posted yet</p></div>
        <div className="flex gap-2"><Button asChild size="sm"><Link to="/assets" hash="depreciation">Approve &amp; post</Link></Button><Button asChild size="sm" variant="outline"><Link to="/assets">Open assets</Link></Button><Button size="sm" variant="ghost" onClick={() => void dismiss(g.month)}>Dismiss</Button></div>
      </div>)}
      {blocked.length > 0 && <div className="border-t pt-2 text-sm"><p className="text-muted-foreground">Can't run for these assets:</p>
        <ul>{blocked.map(({ a, x }) => <li key={a.id} className="flex items-center justify-between gap-2"><span>{a.name} — {x.join(", ")}</span><Button asChild size="sm" variant="ghost"><Link to="/assets">Edit</Link></Button></li>)}</ul></div>}
    </section>
  );
}
