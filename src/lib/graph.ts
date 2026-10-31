// Personal finance knowledge graph: how accounts, payment methods, people, loans, planned
// payments and documents connect. Pure, tested; derived on demand, never stored.

export type NodeKind = "account" | "method" | "member" | "loan" | "commitment" | "document";
export interface GraphNode { id: string; kind: NodeKind; label: string }
export interface GraphEdge { from: string; to: string; label: string }

export interface GraphInput {
  accounts: { id: string; name: string; archived?: boolean }[];
  methods: { id: string; nickname: string; accountId: string; memberId?: string | null; parentId?: string | null }[];
  members: { id: string; name: string }[];
  loans: { id: string; name: string; accountId?: string | null }[];
  commitments: { id: string; name: string; accountId: string | null; status?: string }[];
  documents: { id: string; title: string; accountId: string | null; loanId: string | null }[];
}

const key = (k: NodeKind, id: string) => `${k}:${id}`;

export function buildGraph(i: GraphInput): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const has = new Set<string>();
  const add = (k: NodeKind, id: string, label: string) => { const n = key(k, id); if (!has.has(n)) { has.add(n); nodes.push({ id: n, kind: k, label }); } };
  const link = (from: string, to: string, label: string) => { if (has.has(from) && has.has(to)) edges.push({ from, to, label }); };

  for (const a of i.accounts) if (!a.archived) add("account", a.id, a.name);
  for (const m of i.members) add("member", m.id, m.name);
  for (const l of i.loans) add("loan", l.id, l.name);
  for (const c of i.commitments) if (c.status !== "completed") add("commitment", c.id, c.name);
  for (const p of i.methods) add("method", p.id, p.nickname);
  for (const d of i.documents) add("document", d.id, d.title);

  for (const p of i.methods) {
    link(key("method", p.id), key("account", p.accountId), "pays from");
    if (p.memberId) link(key("member", p.memberId), key("method", p.id), "uses");
    if (p.parentId) link(key("method", p.id), key("method", p.parentId), "add-on of");
  }
  for (const l of i.loans) if (l.accountId) link(key("loan", l.id), key("account", l.accountId), "linked to");
  for (const c of i.commitments) if (c.accountId) link(key("commitment", c.id), key("account", c.accountId), "paid from");
  for (const d of i.documents) {
    if (d.accountId) link(key("document", d.id), key("account", d.accountId), "about");
    if (d.loanId) link(key("document", d.id), key("loan", d.loanId), "about");
  }
  return { nodes, edges };
}

/** Everything directly connected to one node. */
export function neighbours(g: { nodes: GraphNode[]; edges: GraphEdge[] }, id: string) {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  return g.edges
    .filter((e) => e.from === id || e.to === id)
    .map((e) => ({ node: byId.get(e.from === id ? e.to : e.from)!, label: e.label, outgoing: e.from === id }));
}

/** Nodes with no connections — often a sign something isn't linked yet. */
export function unlinked(g: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const used = new Set(g.edges.flatMap((e) => [e.from, e.to]));
  return g.nodes.filter((n) => !used.has(n.id) && n.kind !== "member");
}
