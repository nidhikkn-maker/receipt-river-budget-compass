import { Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { money } from "@/lib/expenses";
import type { TrendPoint } from "@/lib/card-trend";

const short = (n: number) => (Math.abs(n) >= 1e7 ? `₹${(n / 1e7).toFixed(1)}Cr` : Math.abs(n) >= 1e5 ? `₹${(n / 1e5).toFixed(1)}L` : `₹${Math.round(n / 1000)}k`);

/** Compact hover box: short enough to stay inside a phone-width panel, and never blocks taps. */
const TrendTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number | null }[]; label?: string }) => {
  const rows = (payload ?? []).filter((p) => p.value != null);
  if (!active || !rows.length) return null;
  return (
    <div className="max-w-[190px] rounded-lg border bg-popover p-2 text-[11px] leading-snug shadow-md">
      <div className="mb-1 font-semibold text-foreground">{label}</div>
      {rows.map((p) => (
        <div key={p.name} className="flex justify-between gap-2 text-foreground">
          <span className="min-w-0 truncate">{p.name}</span>
          <span className="shrink-0 font-mono">{money(Number(p.value))}</span>
        </div>
      ))}
    </div>
  );
};

/** One line per card: amount owed above zero, credit below. Points with no data are left out, never drawn as zero. */
export function CardTrendChart({ points, names, height = 180 }: { points: TrendPoint[]; names: string[]; height?: number }) {
  const shown = names.filter((n) => points.some((p) => p[n] != null));
  if (!shown.length) return <p className="text-sm text-muted-foreground">Not enough recorded history to chart yet.</p>;
  return (
    <div className="w-full min-w-0" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={short} fontSize={11} width={54} tickLine={false} axisLine={false} />
          <Tooltip content={<TrendTooltip />} wrapperStyle={{ pointerEvents: "none" }} />
          {shown.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
          {shown.map((n, i) => <Line key={n} dataKey={n} stroke={`var(--chart-${(i % 5) + 1})`} strokeWidth={2} dot={false} connectNulls={false} />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
