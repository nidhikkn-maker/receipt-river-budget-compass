import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageTitle, Stat } from "@/components/AppShell";
import { ExpenseTable } from "@/components/ExpenseTable";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORIES, applyFilters, money, totalsByScope, type Filters } from "@/lib/expenses";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/expenses")({
  head: () => ({
    meta: [
      { title: "Expenses — Ledgerline" },
      { name: "description", content: "Filter expenses by business or personal, family member, category and date." },
      { property: "og:title", content: "Expenses — Ledgerline" },
      { property: "og:description", content: "Filter expenses by business or personal, family member, category and date." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Expenses,
});

function Expenses() {
  const { expenses, members } = useStore();
  const [f, setF] = useState<Filters>({ scope: "all", memberId: "all", category: "all" });
  const list = applyFilters(expenses, f);
  const t = totalsByScope(list);

  return (
    <>
      <PageTitle eyebrow="All expenses" title="Sort it out" sub="Separate business from personal, and see who each expense was for." />
      <div className="mb-4 inline-grid grid-cols-3 rounded-2xl bg-secondary p-1 text-sm" role="radiogroup" aria-label="Show">
        {(["all", "business", "personal"] as const).map((s) => (
          <button key={s} role="radio" aria-checked={f.scope === s} onClick={() => setF({ ...f, scope: s })}
            className={cn("rounded-xl px-4 py-2 font-semibold capitalize", f.scope === s ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{s}</button>
        ))}
      </div>
      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <Select value={f.memberId ?? "all"} onValueChange={(v) => setF({ ...f, memberId: v })}>
          <SelectTrigger aria-label="Family member"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everyone</SelectItem>
            <SelectItem value="me">Me</SelectItem>
            {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={f.category ?? "all"} onValueChange={(v) => setF({ ...f, category: v as NonNullable<Filters["category"]> })}>
          <SelectTrigger aria-label="Category"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" aria-label="From" value={f.from ?? ""} onChange={(e) => setF({ ...f, from: e.target.value })} />
        <Input type="date" aria-label="To" value={f.to ?? ""} onChange={(e) => setF({ ...f, to: e.target.value })} />
      </div>
      <div className="mb-6 grid grid-cols-3 gap-3">
        <Stat tone="business" label="Business" value={money(t.business)} />
        <Stat tone="personal" label="Personal" value={money(t.personal)} />
        <Stat label={`${list.length} total`} value={money(t.total)} />
      </div>
      <ExpenseTable items={list} empty="No expenses match these filters." />
    </>
  );
}
