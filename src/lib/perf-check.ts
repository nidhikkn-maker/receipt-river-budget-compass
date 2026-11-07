/** On-device page speed records (C-0547, C-0605). Device-local only; never uploaded. */
export type PerfSample = { path: string; kind: "first" | "page"; ms: number; at: number };
export type PerfTarget = { path: string; label: string; targetMs: number };

export const PERF_KEY = "ledgerline.perf.v1";
export const PERF_MAX = 200;
export const PERF_TARGETS: PerfTarget[] = [
  { path: "/inbox", label: "Financial Inbox", targetMs: 2000 },
  { path: "/expenses", label: "Expenses", targetMs: 2000 },
  { path: "/statements", label: "Statement Desk", targetMs: 2500 },
  { path: "/dashboard", label: "Home", targetMs: 2000 },
];

/** Append a sample, discarding invalid timings and keeping the newest PERF_MAX. */
export function addSample(list: PerfSample[], s: PerfSample): PerfSample[] {
  if (!Number.isFinite(s.ms) || s.ms < 0 || s.ms > 120_000) return list;
  return [...list, { ...s, ms: Math.round(s.ms) }].slice(-PERF_MAX);
}

/** Nearest-rank percentile. */
export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const v = [...values].sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.max(0, Math.ceil((p / 100) * v.length) - 1))] ?? null;
}

export type PerfRow = PerfTarget & { count: number; median: number | null; p90: number | null; result: "pass" | "slow" | "no_data" };

/** Median against target decides; fewer than 3 samples is not enough evidence. */
export function summarise(list: PerfSample[], targets = PERF_TARGETS): PerfRow[] {
  return targets.map((t) => {
    const ms = list.filter((s) => s.path === t.path).map((s) => s.ms);
    const median = percentile(ms, 50), p90 = percentile(ms, 90);
    const result = ms.length < 3 || median === null ? "no_data" : median <= t.targetMs ? "pass" : "slow";
    return { ...t, count: ms.length, median, p90, result };
  });
}

export function loadSamples(): PerfSample[] {
  try { const v = JSON.parse(localStorage.getItem(PERF_KEY) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function recordSample(s: PerfSample) {
  try { localStorage.setItem(PERF_KEY, JSON.stringify(addSample(loadSamples(), s))); } catch { /* storage full: skip */ }
}
export function clearSamples() { try { localStorage.removeItem(PERF_KEY); } catch { /* ignore */ } }
