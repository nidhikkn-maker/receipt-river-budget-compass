import { useRef, useState } from "react";
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
type Pt = { x: number; y: number };
export function ConnectionsMap({ nodes, edges, selected, onSelect, saved = {}, onMove }: { nodes: GraphNode[]; edges: GraphEdge[]; selected: string | null; onSelect: (id: string) => void; saved?: Record<string, Pt>; onMove?: (id: string, p: Pt) => void }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number; p: Pt; moved: boolean } | null>(null);
  const cols: GraphNode[][] = [[], [], [], [], []];
  for (const n of nodes) cols[COLUMN[n.kind]]!.push(n);
  if (!nodes.length) return null;
  const used = cols.map((c, i) => (c.length ? i : -1)).filter((i) => i >= 0);
  const xOf = new Map(used.map((c, i) => [c, i * COL_W + 10]));
  const pos = new Map<string, { x: number; y: number }>();
  for (const c of used) cols[c]!.forEach((n, r) => pos.set(n.id, { x: xOf.get(c)!, y: TOP + r * ROW_H }));
  for (const n of nodes) if (saved[n.id]) pos.set(n.id, saved[n.id]!);
  if (drag) pos.set(drag.id, drag.p);
  const all = [...pos.values()];
  const height = Math.max(TOP + Math.max(...used.map((c) => cols[c]!.length)) * ROW_H, ...all.map((p) => p.y + NODE_H + 10));
  const width = Math.max(used.length * COL_W, ...all.map((p) => p.x + NODE_W + 10));
  const pt = (e: React.PointerEvent) => { const r = svgRef.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const nudge = (id: string, dx: number, dy: number) => { const p = pos.get(id)!; onMove?.(id, { x: Math.max(0, p.x + dx), y: Math.max(30, p.y + dy) }); };
  const near = new Set(selected ? edges.filter((e) => e.from === selected || e.to === selected).flatMap((e) => [e.from, e.to]) : []);
  const clip = (s: string) => (s.length > 20 ? `${s.slice(0, 19)}…` : s);

  return (
    <div className="mb-4 overflow-x-auto rounded-2xl border bg-card p-3">
      <svg ref={svgRef} onPointerMove={(e) => { if (!drag) return; const m = pt(e); setDrag({ ...drag, moved: true, p: { x: Math.max(0, m.x - drag.dx), y: Math.max(30, m.y - drag.dy) } }); }} onPointerUp={() => { if (drag?.moved) onMove?.(drag.id, drag.p); else if (drag) onSelect(drag.id); setDrag(null); }} onPointerLeave={() => { if (drag?.moved) onMove?.(drag.id, drag.p); setDrag(null); }} style={{ touchAction: drag ? "none" : "auto" }} role="img" aria-label="Map of how your accounts, payment methods, loans, bills and documents connect" width={width} height={height} className="block">
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
            <g key={n.id} transform={`translate(${p.x},${p.y})`} className={onMove ? "cursor-move" : "cursor-pointer"} style={{ touchAction: "none" }} opacity={dim ? 0.4 : 1} onPointerDown={(e) => { const m = pt(e); setDrag({ id: n.id, dx: m.x - p.x, dy: m.y - p.y, p, moved: false }); }} role="button" tabIndex={0} aria-label={`${n.label}. Drag or use arrow keys to move.`} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(n.id); const step = e.shiftKey ? 50 : 10; const k: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }; if (k[e.key] && onMove) { e.preventDefault(); nudge(n.id, ...k[e.key]!); } }}>
              <rect width={NODE_W} height={NODE_H} rx={10} className={TONE[n.kind]} strokeWidth={on ? 3 : 1.5} />
              <text x={10} y={21} className={`text-[12px] font-medium ${n.kind === "account" ? "fill-primary-foreground" : "fill-foreground"}`}>{clip(n.label)}<title>{n.label}</title></text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
