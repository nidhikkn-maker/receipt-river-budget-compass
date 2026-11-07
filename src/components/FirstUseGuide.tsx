import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { AccountingDetails } from "@/components/AccountingDetails";
import { Button } from "@/components/ui/button";
import { MANAGE_CHOICES, journeysFor, type ManageChoice } from "@/lib/first-use-guide";
import { cn } from "@/lib/utils";

/** Plain-language tour of the six everyday situations. Shows no sample figures and opens only real flows. */
export function FirstUseGuide() {
  const [choice, setChoice] = useState<ManageChoice | null>(null);
  const journeys = journeysFor(choice);
  return (
    <div className="space-y-8">
      <section aria-labelledby="manage-q" className="space-y-3">
        <h2 id="manage-q" className="font-display text-xl font-semibold">What would you like to manage?</h2>
        <div role="radiogroup" aria-labelledby="manage-q" className="grid gap-2 sm:grid-cols-3">
          {MANAGE_CHOICES.map((c) => (
            <button key={c.key} type="button" role="radio" aria-checked={choice === c.key} onClick={() => setChoice(choice === c.key ? null : c.key)}
              className={cn("min-h-11 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", choice === c.key ? "border-primary bg-secondary" : "bg-card hover:bg-secondary")}>
              <span className="block font-semibold">{c.title}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{c.body}</span>
            </button>
          ))}
        </div>
        {choice === "business" && <p className="text-sm">Setting up a company? <Link to="/statements" search={{ context: "entity" }} className="font-medium text-primary underline">Add its documents first</Link> — registration papers, past accounts or bank statements. I read them and ask you to confirm the details.</p>}
        {choice === "family" && <p className="text-sm">You can invite family members from <Link to="/family" className="font-medium text-primary underline">Family</Link>. They sign in with their own account; you decide what they can see.</p>}
      </section>

      <section aria-labelledby="journeys-h" className="space-y-3">
        <h2 id="journeys-h" className="font-display text-xl font-semibold">How Ledgerline handles everyday money</h2>
        <p className="text-sm text-muted-foreground">These are explanations, not your records. Each button opens the real screen; nothing is saved until you confirm there.</p>
        <ol className="divide-y rounded-2xl border bg-card">
          {journeys.map((j) => (
            <li key={j.key} className="space-y-2 p-4" aria-labelledby={`j-${j.key}`}>
              <h3 id={`j-${j.key}`} className="font-semibold">{j.title}</h3>
              <p className="text-sm text-muted-foreground">{j.situation}</p>
              <p className="text-sm">{j.ledgerlineSays}</p>
              <p className="text-sm"><span className="font-medium">What you do: </span>{j.youDo}</p>
              <p className="text-xs text-muted-foreground">{j.safeguard}</p>
              <div className="flex flex-wrap items-center gap-3">
                <Button asChild size="sm"><Link to={j.next.to} search={j.next.search as never}>{j.next.label}<ArrowRight aria-hidden className="size-4" /></Link></Button>
              </div>
              <AccountingDetails><p className="text-xs">Accounting term: {j.technical}</p></AccountingDetails>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
