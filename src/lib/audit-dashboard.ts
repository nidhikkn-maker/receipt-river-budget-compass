/** Continuous audit dashboard: one list of open findings from existing read-only rules. */
import type { Expense } from "./expenses";
import type { VaultDoc } from "./documents";
import { gstinProblem, panProblem, yearStatuses, type EntityProfile } from "./entities";
import { missingInvoices } from "./gst-recon";
import type { Asset } from "./assets";

export interface Finding { key: string; area: "Profiles" | "Invoices" | "Assets" | "Years"; text: string; to: string; severity: "high" | "medium" }

export function auditFindings(today: string, entities: EntityProfile[], assets: Asset[], entries: Expense[], docs: VaultDoc[]): Finding[] {
  const out: Finding[] = [];
  for (const p of entities) {
    const pe = panProblem(p.pan, p.kind);
    if (pe) out.push({ key: `pan:${p.id}`, area: "Profiles", text: `${p.name}: ${pe}`, to: "/entities", severity: "high" });
    for (const g of p.gstins) { const ge = gstinProblem(g, p.pan); if (ge) out.push({ key: `gst:${p.id}:${g}`, area: "Profiles", text: `${p.name} ${g}: ${ge}`, to: "/entities", severity: "high" }); }
    const dates = entries.map((e) => e.date);
    for (const y of yearStatuses(p.booksFrom, today, dates, entries.filter((e) => e.statementRef || e.reconciledAt).map((e) => e.date), docs.map((d) => d.docDate ?? d.createdAt.slice(0, 10))))
      if (y.state !== "covered") out.push({ key: `fy:${p.id}:${y.fy}`, area: "Years", text: `${p.name}: FY ${y.fy} ${y.state === "empty" ? "has no records" : "has no bank statement on record"}`, to: "/statements", severity: "medium" });
  }
  const missing = missingInvoices(entries, docs, 0);
  if (missing.length) out.push({ key: "inv", area: "Invoices", text: `${missing.length} business spends have no bill`, to: "/gst-check", severity: missing.some((m) => m.amount >= 10000) ? "high" : "medium" });
  for (const a of assets) if (!a.docId && !a.soldOn) out.push({ key: `asset:${a.id}`, area: "Assets", text: `${a.name}: no ${a.kind === "property" ? "deed" : "purchase invoice"} linked`, to: "/assets", severity: a.kind === "property" ? "high" : "medium" });
  return out.sort((x, y) => (x.severity === y.severity ? 0 : x.severity === "high" ? -1 : 1));
}
