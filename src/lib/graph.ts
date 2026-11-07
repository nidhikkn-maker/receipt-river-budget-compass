// Personal finance knowledge graph: how accounts, cards, payment methods, people, loans, bills
// and documents connect. Pure, tested. Record links come from the records themselves (editing a
// link edits the record); "custom" links are the user's own notes stored in preferences.

export type NodeKind = "account" | "card" | "method" | "member" | "loan" | "commitment" | "document";
export interface GraphNode { id: string; kind: NodeKind; label: string; details: string[] }
/** Which record field an editable link maps to. */
export type LinkField = "commitment.account" | "method.account" | "method.member" | "document.account" | "document.loan" | "loan.account" | "method.parent" | "custom";
export interface GraphEdge { id: string; from: string; to: string; label: string; reason: string; field: LinkField; editable: boolean; note?: string }
export interface MapLink { id: string; from: string; to: string; note: string }

export interface GraphInput {
  accounts: { id: string; name: string; kind?: string; archived?: boolean; balance?: number | undefined }[];
  methods: { id: string; nickname: string; type?: string; accountId: string; memberId?: string | null; parentId?: string | null; archived?: boolean }[];
  members: { id: string; name: string; relation?: string }[];
  loans: { id: string; name: string; accountId?: string | null; emi?: number | undefined; principal?: number | undefined; nextDue?: string | undefined }[];
  commitments: { id: string; name: string; accountId: string | null; status?: string; amount?: number; frequency?: string; nextDue?: string; direction?: string }[];
  documents: { id: string; title: string; accountId: string | null; loanId: string | null; docType?: string; expiresOn?: string | null }[];
  custom?: MapLink[];
}

export const nodeKey = (k: NodeKind, id: string) => `${k}:${id}`;
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const words = (s: string) => s.replace(/_/g, " ");

export function buildGraph(i: GraphInput): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const has = new Map<string, GraphNode>();
  const add = (k: NodeKind, id: string, label: string, details: (string | null | false | undefined)[]) => {
    const n = nodeKey(k, id); if (has.has(n)) return;
    const node = { id: n, kind: k, label, details: details.filter((d): d is string => !!d) }; has.set(n, node); nodes.push(node);
  };
  const link = (from: string, to: string, label: string, reason: string, field: LinkField, editable: boolean, id = `${field}:${from}`, note?: string) => {
    if (has.has(from) && has.has(to)) edges.push({ id, from, to, label, reason, field, editable, ...(note !== undefined ? { note } : {}) });
  };
  const acctKey = (id: string) => { const a = i.accounts.find((x) => x.id === id); return nodeKey(a?.kind === "credit_card" ? "card" : "account", id); };

  for (const a of i.accounts) if (!a.archived) add(a.kind === "credit_card" ? "card" : "account", a.id, a.name, [a.kind && words(a.kind), a.balance != null && `Balance ${inr(a.balance)}`]);
  for (const m of i.members) add("member", m.id, m.name, [m.relation || "Family"]);
  for (const l of i.loans) add("loan", l.id, l.name, [l.principal != null && `Owed ${inr(l.principal)}`, l.emi != null && `EMI ${inr(l.emi)}`, l.nextDue && `Next ${l.nextDue}`]);
  for (const c of i.commitments) if (c.status !== "completed") add("commitment", c.id, c.name, [c.amount != null && `${c.direction === "in" ? "Income" : "Payment"} ${inr(c.amount)}`, c.frequency && words(c.frequency), c.nextDue && `Next ${c.nextDue}`]);
  for (const p of i.methods) if (!p.archived) add("method", p.id, p.nickname, [p.type && words(p.type)]);
  for (const d of i.documents) add("document", d.id, d.title, [d.docType && words(d.docType), d.expiresOn && `Expires ${d.expiresOn}`]);

  const nameOf = (k: string) => has.get(k)?.label ?? "";
  for (const p of i.methods) {
    const m = nodeKey("method", p.id);
    link(m, acctKey(p.accountId), "pays from", `Payments made with ${p.nickname} come out of ${nameOf(acctKey(p.accountId))}.`, "method.account", true);
    if (p.memberId) link(nodeKey("member", p.memberId), m, "uses", `${nameOf(nodeKey("member", p.memberId))} uses ${p.nickname}.`, "method.member", true);
    if (p.parentId) link(m, nodeKey("method", p.parentId), "add-on of", `${p.nickname} is an add-on of ${nameOf(nodeKey("method", p.parentId))}.`, "method.parent", false);
  }
  for (const l of i.loans) if (l.accountId) link(nodeKey("loan", l.id), acctKey(l.accountId), "tracked in", `The outstanding balance of ${l.name} is tracked in this account; it is set when the loan is created.`, "loan.account", false);
  for (const c of i.commitments) if (c.accountId) link(nodeKey("commitment", c.id), acctKey(c.accountId), c.direction === "in" ? "paid into" : "paid from", `${c.name}${c.amount != null ? ` (${inr(c.amount)}${c.frequency ? `, ${words(c.frequency)}` : ""})` : ""} is ${c.direction === "in" ? "received into" : "paid from"} ${nameOf(acctKey(c.accountId))}, so forecasts and payment readiness use this balance.`, "commitment.account", true);
  for (const d of i.documents) {
    if (d.accountId) link(nodeKey("document", d.id), acctKey(d.accountId), "about", `${d.title} is filed against this account.`, "document.account", true);
    if (d.loanId) link(nodeKey("document", d.id), nodeKey("loan", d.loanId), "about", `${d.title} is filed against this loan.`, "document.loan", true);
  }
  for (const c of i.custom ?? []) link(c.from, c.to, "related", c.note || "Your own link.", "custom", true, `custom:${c.id}`, c.note);
  return { nodes, edges };
}

/** Everything directly connected to one node. */
export function neighbours(g: { nodes: GraphNode[]; edges: GraphEdge[] }, id: string) {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  return g.edges
    .filter((e) => e.from === id || e.to === id)
    .map((e) => ({ edge: e, node: byId.get(e.from === id ? e.to : e.from)!, label: e.label, outgoing: e.from === id }));
}

/** Nodes with no connections — often a sign something isn't linked yet. */
export function unlinked(g: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const used = new Set(g.edges.flatMap((e) => [e.from, e.to]));
  return g.nodes.filter((n) => !used.has(n.id) && n.kind !== "member");
}

/** Keep only the chosen kinds (and edges between them). */
export function filterGraph(g: { nodes: GraphNode[]; edges: GraphEdge[] }, kinds: NodeKind[]) {
  const nodes = g.nodes.filter((n) => kinds.includes(n.kind));
  const keep = new Set(nodes.map((n) => n.id));
  return { nodes, edges: g.edges.filter((e) => keep.has(e.from) && keep.has(e.to)) };
}

/** What a selected item can be linked to by editing its record. */
export function linkTargets(kind: NodeKind): { field: LinkField; to: NodeKind[]; label: string }[] {
  switch (kind) {
    case "commitment": return [{ field: "commitment.account", to: ["account", "card"], label: "Paid from account or card" }];
    case "method": return [{ field: "method.account", to: ["account", "card"], label: "Pays from account" }, { field: "method.member", to: ["member"], label: "Used by" }];
    case "document": return [{ field: "document.account", to: ["account", "card"], label: "About account" }, { field: "document.loan", to: ["loan"], label: "About loan" }];
    default: return [];
  }
}

/** Validate a custom link between two items. */
export function validateCustomLink(l: Omit<MapLink, "id">, existing: MapLink[]): void {
  if (!l.from || !l.to) throw new Error("Pick both items");
  if (l.from === l.to) throw new Error("Pick two different items");
  if (l.note.length > 200) throw new Error("Keep the reason under 200 characters");
  if (existing.some((e) => (e.from === l.from && e.to === l.to) || (e.from === l.to && e.to === l.from))) throw new Error("These two are already linked");
}
