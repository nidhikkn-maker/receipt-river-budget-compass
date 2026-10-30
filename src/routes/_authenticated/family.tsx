import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2, UserRound } from "lucide-react";
import { PageTitle } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { money, totalsBy } from "@/lib/expenses";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/family")({
  head: () => ({
    meta: [
      { title: "Family — Ledgerline" },
      { name: "description", content: "Add family members to track who each expense was for." },
      { property: "og:title", content: "Family — Ledgerline" },
      { property: "og:description", content: "Add family members to track who each expense was for." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Family,
});

function Family() {
  const { members, expenses, addMember, removeMember } = useStore();
  const [name, setName] = useState("");
  const [relation, setRelation] = useState("");
  const totals = totalsBy(expenses, (e) => e.memberId ?? "me");

  const add = async (ev: React.FormEvent) => {
    ev.preventDefault();
    try { await addMember(name, relation); setName(""); setRelation(""); toast.success("Added"); } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <>
      <PageTitle eyebrow="Family" title="Who's who" sub="Tag each expense with the person it was for." />
      <form onSubmit={add} className="mb-6 grid gap-3 rounded-3xl border bg-card p-5 sm:grid-cols-[1fr_1fr_auto]">
        <Input aria-label="Name" placeholder="Name, e.g. Anu" value={name} onChange={(e) => setName(e.target.value)} />
        <Input aria-label="Relation" placeholder="Relation, e.g. Spouse, Son, Mother" value={relation} onChange={(e) => setRelation(e.target.value)} />
        <Button type="submit">Add member</Button>
      </form>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <li className="flex items-center gap-3 rounded-2xl bg-hero p-4 text-primary-foreground">
          <UserRound className="h-9 w-9 rounded-xl bg-primary-foreground/20 p-1.5" />
          <div className="flex-1"><div className="font-semibold">Me</div><div className="text-xs opacity-80">You</div></div>
          <div className="font-mono">{money(totals["me"] ?? 0)}</div>
        </li>
        {members.map((m) => (
          <li key={m.id} className="flex items-center gap-3 rounded-2xl border bg-card p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary font-display font-bold text-primary">{m.name[0]}</div>
            <div className="min-w-0 flex-1"><div className="truncate font-semibold">{m.name}</div><div className="text-xs text-muted-foreground">{m.relation || "Family"}</div></div>
            <div className="font-mono text-sm">{money(totals[m.id] ?? 0)}</div>
            <button aria-label={`Remove ${m.name}`} className="text-muted-foreground hover:text-destructive"
              onClick={async () => { if (confirm(`Remove ${m.name}? Their expenses stay, tagged to no one.`)) await removeMember(m.id); }}>
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
