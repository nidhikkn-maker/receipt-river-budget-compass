import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageTitle } from "@/components/AppShell";
import { ConnectionsMap } from "@/components/ConnectionsMap";
import { Card } from "@/components/Money";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { buildGraph, neighbours, unlinked, type NodeKind } from "@/lib/graph";

export const Route = createFileRoute("/_authenticated/connections")({
  head: () => ({
    meta: [
      { title: "Connections — how your money links together · Ledgerline" },
      { name: "description", content: "See how accounts, payment methods, family members, loans, planned payments and documents connect." },
      { property: "og:title", content: "Connections · Ledgerline" },
      { property: "og:description", content: "Explore links between your accounts, cards, loans, bills and documents." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Connections,
});

const KIND_LABEL: Record<NodeKind, string> = { account: "Accounts", method: "Payment methods", member: "People", loan: "Loans", commitment: "Planned payments", document: "Documents" };

function Connections() {
  const { accounts, members, loans, commitments, documents, preferences } = useStore();
  const g = useMemo(() => buildGraph({
    accounts, members, commitments, documents,
    methods: preferences.paymentInstruments,
    loans: loans.map((l) => ({ id: l.id, name: l.name, accountId: (l as { accountId?: string | null }).accountId ?? null })),
  }), [accounts, members, loans, commitments, documents, preferences.paymentInstruments]);
  const [sel, setSel] = useState<string | null>(null);
  const loose = unlinked(g);
  const kinds = Object.keys(KIND_LABEL) as NodeKind[];
  const current = g.nodes.find((n) => n.id === sel);
  return (
    <div>
      <PageTitle eyebrow="Explore" title="Connections" sub="Pick anything to see what it's linked to. Built from your records; nothing is changed here." />
      {g.nodes.length > 0 && <ConnectionsMap nodes={g.nodes} edges={g.edges} selected={sel} onSelect={setSel} />}
      {current && <Card title={current.label}>
        {neighbours(g, current.id).length === 0 ? <p className="text-sm text-muted-foreground">Not linked to anything yet.</p> :
          <ul className="space-y-1 text-sm">{neighbours(g, current.id).map((x, i) => <li key={i}><span className="text-muted-foreground">{x.outgoing ? x.label : `← ${x.label}`}</span> <button className="font-semibold text-primary underline-offset-2 hover:underline" onClick={() => setSel(x.node.id)}>{x.node.label}</button> <span className="text-xs text-muted-foreground">({KIND_LABEL[x.node.kind]})</span></li>)}</ul>}
      </Card>}
      {kinds.map((k) => {
        const list = g.nodes.filter((n) => n.kind === k);
        if (!list.length) return null;
        return <Card key={k} title={KIND_LABEL[k]}><div className="flex flex-wrap gap-2">{list.map((n) => <Button key={n.id} size="sm" variant={sel === n.id ? "default" : "outline"} onClick={() => setSel(n.id)}>{n.label} · {neighbours(g, n.id).length}</Button>)}</div></Card>;
      })}
      {loose.length > 0 && <Card title="Not linked yet"><p className="mb-2 text-sm text-muted-foreground">These aren't connected to any account. Linking them keeps balances and forecasts accurate.</p><p className="text-sm">{loose.map((n) => n.label).join(", ")}</p></Card>}
      {g.nodes.length === 0 && <p className="text-sm text-muted-foreground">Add accounts and payment methods to see how they connect.</p>}
    </div>
  );
}
