import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { PageTitle } from "@/components/AppShell";
import { ConnectionsMap } from "@/components/ConnectionsMap";
import { Card, fieldCls } from "@/components/Money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import { usePosition } from "@/lib/use-position";
import { validateInstrument } from "@/lib/payment-instruments";
import { buildGraph, filterGraph, linkTargets, neighbours, unlinked, validateCustomLink, type GraphEdge, type LinkField, type NodeKind } from "@/lib/graph";

export const Route = createFileRoute("/_authenticated/connections")({
  head: () => ({
    meta: [
      { title: "Money map — how your accounts, cards, loans and bills link · Thapal" },
      { name: "description", content: "See, filter and edit how accounts, cards, payment methods, family, loans, bills and documents connect." },
      { property: "og:title", content: "Money map · Thapal" },
      { property: "og:description", content: "Explore and edit links between your accounts, cards, loans, bills and documents." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Connections,
});

const KIND_LABEL: Record<NodeKind, string> = { account: "Accounts", card: "Cards", method: "Payment methods", member: "Family", loan: "Loans", commitment: "Bills & planned payments", document: "Documents" };
const ALL_KINDS = Object.keys(KIND_LABEL) as NodeKind[];
const rawId = (key: string) => key.slice(key.indexOf(":") + 1);

function Connections() {
  const store = useStore();
  const { accounts, members, loans, commitments, documents, preferences, savePreferences, saveCommitment, updateDocument } = store;
  const p = usePosition(30);
  const g = useMemo(() => buildGraph({
    accounts: accounts.map((a) => ({ id: a.id, name: a.name, kind: a.kind, archived: a.archived, balance: p.accounts.find((x) => x.id === a.id)?.balance })),
    members, documents, custom: preferences.mapLinks,
    commitments: commitments.map((c) => ({ id: c.id, name: c.name, accountId: c.accountId, status: c.status, amount: c.amount, frequency: c.frequency, nextDue: c.nextDue, direction: c.direction })),
    methods: preferences.paymentInstruments,
    loans: loans.map((l) => { const x = l as { id: string; name: string; accountId?: string | null; emi?: number; principal?: number; nextDue?: string }; return { id: x.id, name: x.name, accountId: x.accountId ?? null, emi: x.emi, principal: x.principal, nextDue: x.nextDue }; }),
  }), [accounts, members, loans, commitments, documents, preferences.paymentInstruments, preferences.mapLinks, p.accounts]);
  const [kinds, setKinds] = useState<NodeKind[]>(ALL_KINDS);
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState({ to: "", note: "" });
  const view = filterGraph(g, kinds);
  const current = g.nodes.find((n) => n.id === sel);
  const loose = unlinked(g);

  const run = async (fn: () => Promise<void>, ok: string) => { setBusy(true); try { await fn(); toast.success(ok); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } };

  /** Point a record field at a new target (or null to unlink). Edits the underlying record. */
  const setField = (field: LinkField, nodeId: string, target: string | null) => run(async () => {
    const id = rawId(nodeId), to = target ? rawId(target) : null;
    if (field === "commitment.account") {
      const c = commitments.find((x) => x.id === id); if (!c) throw new Error("Payment not found");
      await saveCommitment({ ...c, accountId: to });
    } else if (field === "document.account") await updateDocument(id, { accountId: to });
    else if (field === "document.loan") await updateDocument(id, { loanId: to });
    else if (field === "method.account" || field === "method.member") {
      const all = preferences.paymentInstruments; const m = all.find((x) => x.id === id); if (!m) throw new Error("Payment method not found");
      if (field === "method.account" && !to) throw new Error("A payment method must stay linked to an account — pick another one instead");
      const next = validateInstrument(field === "method.account" ? { ...m, accountId: to! } : { ...m, memberId: to }, accounts, all);
      await savePreferences({ ...preferences, paymentInstruments: all.map((x) => (x.id === id ? { ...next, parentId: m.parentId ?? null } : x)) });
    } else throw new Error("This link can't be changed here");
  }, target ? "Link saved" : "Link removed");

  const removeEdge = (e: GraphEdge) => {
    if (e.field === "custom") return run(() => savePreferences({ ...preferences, mapLinks: preferences.mapLinks.filter((l) => `custom:${l.id}` !== e.id) }), "Link removed");
    const owner = e.field.startsWith("member") ? e.to : e.from;
    return setField(e.field, e.field === "method.member" ? e.to : owner, null);
  };
  const editNote = (e: GraphEdge, note: string) => run(() => savePreferences({ ...preferences, mapLinks: preferences.mapLinks.map((l) => (`custom:${l.id}` === e.id ? { ...l, note: note.slice(0, 200) } : l)) }), "Reason saved");
  const addCustom = () => run(async () => {
    if (!sel) return;
    const l = { from: sel, to: custom.to, note: custom.note.trim() };
    validateCustomLink(l, preferences.mapLinks);
    await savePreferences({ ...preferences, mapLinks: [...preferences.mapLinks, { id: crypto.randomUUID(), ...l }] });
    setCustom({ to: "", note: "" });
  }, "Link added");

  const toggle = (k: NodeKind) => setKinds(kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k]);
  const present = ALL_KINDS.filter((k) => g.nodes.some((n) => n.kind === k));
  const links = current ? neighbours(g, current.id) : [];

  return (
    <div>
      <PageTitle eyebrow="Explore" title="Money map" sub="Tap an item to see why it's connected and to add, change or remove links. Changing a record link updates that record." />
      {present.length > 0 && <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Show on map">
        <span className="text-xs font-semibold text-muted-foreground">Show:</span>
        {present.map((k) => <Button key={k} size="sm" variant={kinds.includes(k) ? "default" : "ghost"} className={kinds.includes(k) ? "" : "text-muted-foreground line-through"} aria-pressed={kinds.includes(k)} onClick={() => toggle(k)}>{KIND_LABEL[k]}</Button>)}
        <Button size="sm" variant="ghost" onClick={() => setKinds(ALL_KINDS)}>Show all</Button>
      </div>}
      {view.nodes.length > 0 && <>
        <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Drag boxes to arrange your map (or select one and use arrow keys). Positions save automatically.</span>
          {Object.keys(preferences.mapPositions).length > 0 && <button type="button" className="underline" onClick={() => run(() => savePreferences({ ...preferences, mapPositions: {} }), "Layout reset")}>Reset layout</button>}
        </div>
        <ConnectionsMap nodes={view.nodes} edges={view.edges} selected={sel} onSelect={setSel} saved={preferences.mapPositions} onMove={(id, pt) => { void savePreferences({ ...preferences, mapPositions: { ...preferences.mapPositions, [id]: pt } }); }} />
      </>}

      {current && <Card title={current.label} action={<Button size="icon" variant="ghost" aria-label="Close" onClick={() => setSel(null)}><X className="h-4 w-4" /></Button>}>
        <p className="mb-3 text-xs text-muted-foreground">{KIND_LABEL[current.kind]}{current.details.length ? ` · ${current.details.join(" · ")}` : ""}</p>
        {links.length === 0 ? <p className="mb-3 text-sm text-muted-foreground">Not linked to anything yet.</p> : (
          <ul className="mb-4 divide-y">
            {links.map(({ edge, node, outgoing }) => (
              <li key={edge.id} className="py-2 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p><span className="text-muted-foreground">{outgoing ? edge.label : `← ${edge.label}`}</span> <button className="font-semibold text-primary hover:underline" onClick={() => setSel(node.id)}>{node.label}</button> <span className="text-xs text-muted-foreground">({KIND_LABEL[node.kind]}{node.details.length ? ` · ${node.details.join(" · ")}` : ""})</span></p>
                    <p className="text-xs text-muted-foreground"><b>Why:</b> {edge.reason}{edge.field === "custom" ? " (your link)" : " (from the record)"}</p>
                    {edge.field === "custom" && <Input className="mt-1 h-8" aria-label="Reason for this link" defaultValue={edge.note ?? ""} placeholder="Reason" onBlur={(e) => { if (e.target.value !== (edge.note ?? "")) void editNote(edge, e.target.value); }} />}
                  </div>
                  {edge.editable && edge.field !== "method.account" && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void removeEdge(edge)}>Remove</Button>}
                </div>
              </li>
            ))}
          </ul>
        )}
        {linkTargets(current.kind).map((t) => {
          const options = g.nodes.filter((n) => t.to.includes(n.kind));
          const now = g.edges.find((e) => e.field === t.field && (t.field === "method.member" ? e.to === current.id : e.from === current.id));
          const value = now ? (t.field === "method.member" ? now.from : now.to) : "";
          return <div key={t.field} className="mb-2 grid gap-1 sm:grid-cols-[12rem_1fr] sm:items-center">
            <span className="text-sm font-medium">{t.label}</span>
            <select aria-label={t.label} className={fieldCls} disabled={busy} value={value} onChange={(e) => void setField(t.field, current.id, e.target.value || null)}>
              {t.field !== "method.account" && <option value="">Not linked</option>}
              {options.map((o) => <option key={o.id} value={o.id}>{o.label} ({KIND_LABEL[o.kind]})</option>)}
            </select>
          </div>;
        })}
        <div className="mt-3 border-t pt-3">
          <p className="mb-2 text-sm font-medium">Add your own link</p>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <select aria-label="Link to" className={fieldCls} value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })}>
              <option value="">Link to…</option>{g.nodes.filter((n) => n.id !== current.id).map((n) => <option key={n.id} value={n.id}>{n.label} ({KIND_LABEL[n.kind]})</option>)}
            </select>
            <Input aria-label="Reason" placeholder="Reason, e.g. Card autopay from this account" value={custom.note} onChange={(e) => setCustom({ ...custom, note: e.target.value })} />
            <Button disabled={busy || !custom.to} onClick={() => void addCustom()}>Add link</Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Your own links are notes for the map; they don't change balances or forecasts.</p>
        </div>
      </Card>}

      {loose.length > 0 && <Card title="Not linked yet"><p className="mb-2 text-sm text-muted-foreground">Tap one to link it — linking keeps balances and forecasts accurate.</p><div className="flex flex-wrap gap-2">{loose.map((n) => <Button key={n.id} size="sm" variant="outline" onClick={() => { setSel(n.id); if (!kinds.includes(n.kind)) setKinds([...kinds, n.kind]); }}>{n.label}</Button>)}</div></Card>}
      {g.nodes.length === 0 && <p className="text-sm text-muted-foreground">Add accounts and payment methods to see how they connect.</p>}
    </div>
  );
}
