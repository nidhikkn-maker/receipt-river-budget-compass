// Workspaces (Personal/Family/Business/Official), classification suggestions and
// single-transaction multi-workspace allocations. Allocations reference the original
// entry; they never create extra transactions, so totals are counted once.
import type { Scope } from "./expenses";

export interface WorkspaceShare { workspace: Scope; amount: number }
export type AllocationMethod = "fixed" | "percent" | "equal";
export type Confidence = "high" | "review" | "none";
export interface Suggestion { workspace: Scope | null; confidence: Confidence; reason: string }

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Build shares from a method. Percent inputs are 0–100; the last share absorbs rounding so the sum is exact. */
export function buildShares(total: number, method: AllocationMethod, parts: { workspace: Scope; value: number }[]): WorkspaceShare[] {
  if (!parts.length) return [];
  const raw = method === "equal" ? parts.map(() => total / parts.length) : method === "percent" ? parts.map((p) => (total * p.value) / 100) : parts.map((p) => p.value);
  const out = parts.map((p, i) => ({ workspace: p.workspace, amount: r2(raw[i]!) }));
  if (method !== "fixed") { const head = out.slice(0, -1).reduce((s, x) => s + x.amount, 0); out[out.length - 1]!.amount = r2(total - head); }
  return out;
}

/** Shares must be positive, one per workspace, at least two, and add up exactly to the original amount. */
export function validateShares(shares: WorkspaceShare[], total: number): string | null {
  if (!shares.length) return null;
  if (shares.length < 2) return "Split across at least two workspaces";
  if (new Set(shares.map((s) => s.workspace)).size !== shares.length) return "Each workspace can appear only once";
  if (shares.some((s) => !(s.amount > 0))) return "Every share must be more than zero";
  const sum = r2(shares.reduce((s, x) => s + x.amount, 0));
  if (Math.abs(sum - r2(total)) > 0.009) return `Shares add up to ${sum}, but the entry is ${r2(total)}`;
  return null;
}

/** INR amount per workspace for one entry. Shares are in the entry's original currency; the stored rate converts them, last share takes the remainder. */
export function workspaceParts(e: { scope: Scope; amount: number; originalAmount?: number | null; workspaceAllocations?: WorkspaceShare[] }): WorkspaceShare[] {
  const a = e.workspaceAllocations ?? [];
  if (a.length < 2) return [{ workspace: e.scope, amount: e.amount }];
  const orig = e.originalAmount || a.reduce((s, x) => s + x.amount, 0);
  const out = a.map((x) => ({ workspace: x.workspace, amount: r2((x.amount / orig) * e.amount) }));
  const head = out.slice(0, -1).reduce((s, x) => s + x.amount, 0);
  out[out.length - 1]!.amount = r2(e.amount - head);
  return out;
}

export function workspaceTotals(list: Parameters<typeof workspaceParts>[0][]): Record<Scope, number> & { total: number } {
  const t = { personal: 0, family: 0, business: 0, official: 0, total: 0 };
  for (const e of list) { for (const p of workspaceParts(e)) t[p.workspace] = r2(t[p.workspace] + p.amount); t.total = r2(t.total + e.amount); }
  return t;
}

interface History { merchant: string | null; scope: Scope; category?: string; tags?: string[]; accountId?: string | null }
const ORG_BUSINESS = /^Organisation: /;

/** Suggest a workspace. Tags and trip context beat history; history needs a clear majority, since one shop can serve several purposes. */
export function suggestWorkspace(input: { merchant?: string | null; tags?: string[]; tripType?: string | null; category?: string }, history: History[]): Suggestion {
  const tags = input.tags ?? [];
  if (input.tripType && ["personal", "family", "business", "official"].includes(input.tripType)) return { workspace: input.tripType as Scope, confidence: "high", reason: `Linked to a ${input.tripType} trip` };
  if (tags.includes("Purpose: Business-related") || tags.some((t) => ORG_BUSINESS.test(t))) return { workspace: "business", confidence: "high", reason: "Tagged with an organisation or business purpose" };
  if (tags.includes("Purpose: Family")) return { workspace: "family", confidence: "high", reason: "Tagged as family" };
  const m = input.merchant?.trim().toLowerCase();
  if (m) {
    const past = history.filter((h) => h.merchant?.trim().toLowerCase() === m);
    if (past.length) {
      const counts = new Map<Scope, number>(); for (const h of past) counts.set(h.scope, (counts.get(h.scope) ?? 0) + 1);
      const [top, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!;
      const share = n / past.length;
      if (past.length >= 3 && share >= 0.8) return { workspace: top, confidence: "high", reason: `${n} of ${past.length} earlier entries here were ${top}` };
      return { workspace: top, confidence: "review", reason: `Mixed history here (${n} of ${past.length} ${top}) — please check` };
    }
  }
  if (input.category && /subscription|grocer/i.test(input.category)) return { workspace: "personal", confidence: "review", reason: "Usually personal for this category" };
  return { workspace: null, confidence: "none", reason: "No pattern yet — choose a workspace" };
}
