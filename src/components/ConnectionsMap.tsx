import type { GraphEdge, GraphNode, NodeKind } from "@/lib/graph";

// Column layout: people → payment methods → accounts → loans/bills → documents.
const COLUMN: Record<NodeKind, number> = { member: 0, method: 1, account: 2, card: 2, loan: 3, commitment: 3, document: 4 };
const HEAD = ["Family", "Payment methods", "Accounts & cards", "Loans & bills", "Documents"];
const TONE: Record<NodeKind, string> = {
  member: "fill-secondary stroke-border", method: "fill-card stroke-primary", account: "fill-primary stroke-primary", card: "fill-accent stroke-accent",
  loan: "fill-card stroke-destructive", commitment: "fill-card stroke-accent", document: "fill-muted stroke-border",
};
const COL_W = 190, ROW_H = 46, NODE_W = 160, NODE_H = 32, TOP = 40;

/** Visual map of how records link. Click a box to see its connections. */
export function ConnectionsMap({ nodes, edges, selected, onSelect }: { nodes: GraphNode[]; edges: GraphEdge[]; selected: string | null; onSelect: (id: string) => void }) {
  const cols: GraphNode[][] = [[], [], [], [], []];
  for (const n of nodes) cols[COLUMN[n.kind]]!.push(n);
  if (!nodes.length) return null;
  const used = cols.map((c, i) => (c.length ? i : -1)).filter((i) => i >= 0);
  const xOf = new Map(used.map((c, i) => [c, i * COL_W + 10]));
  const pos = new Map<string, { x: number; y: number }>();
  for (const c of used) cols[c]!.forEach((n, r) => pos.set(n.id, { x: xOf.get(c)!, y: TOP + r * ROW_H }));
  const height = TOP + Math.max(...used.map((c) => cols[c]!.length)) * ROW_H;
  const width = used.length * COL_W;
  const near = new Set(selected ? edges.filter((e) => e.from === selected || e.to === selected).flatMap((e) => [e.from, e.to]) : []);
  const clip = (s: string) => (s.length > 20 ? `${s.slice(0, 19)}…` : s);

  return (
    <div className="mb-4 overflow-x-auto rounded-2xl border bg-card p-3">
      <svg role="img" aria-label="Map of how your accounts, payment methods, loans, bills and documents connect" width={width} height={height} className="block">
        {used.map((c) => <text key={c} x={xOf.get(c)!} y={18} className="fill-muted-foreground text-[11px] font-semibold">{HEAD[c]}</text>)}
        {edges.map((e, i) => {
          const a = pos.get(e.from), b = pos.get(e.to); if (!a || !b) return null;
          const [l, r] = a.x <= b.x ? [a, b] : [b, a];
          const x1 = l.x + NODE_W, y1 = l.y + NODE_H / 2, x2 = r.x, y2 = r.y + NODE_H / 2;
          const same = l.x === r.x;
          const d = same ? `M${l.x + NODE_W} ${y1} C${l.x + NODE_W + 25} ${y1} ${l.x + NODE_W + 25} ${y2} ${l.x + NODE_W} ${y2}` : `M${x1} ${y1} C${(x1 + x2) / 2} ${y1} ${(x1 + x2) / 2} ${y2} ${x2} ${y2}`;
          const hot = selected && (e.from === selected || e.to === selected);
          return <path key={i} d={d} fill="none" className={hot ? "stroke-primary" : "stroke-border"} strokeWidth={hot ? 2.5 : 1.5} opacity={selected && !hot ? 0.35 : 1}><title>{e.reason}</title></path>;
        })}
        {nodes.map((n) => {
          const p = pos.get(n.id)!; const on = n.id === selected; const dim = selected && !on && !near.has(n.id);
          return (
            <g key={n.id} transform={`translate(${p.x},${p.y})`} className="cursor-pointer" opacity={dim ? 0.4 : 1} onClick={() => onSelect(n.id)} role="button" tabIndex={0} aria-label={n.label} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(n.id); }}>
              <rect width={NODE_W} height={NODE_H} rx={10} className={TONE[n.kind]} strokeWidth={on ? 3 : 1.5} />
              <text x={10} y={21} className={`text-[12px] font-medium ${n.kind === "account" ? "fill-primary-foreground" : "fill-foreground"}`}>{clip(n.label)}<title>{n.label}</title></text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
