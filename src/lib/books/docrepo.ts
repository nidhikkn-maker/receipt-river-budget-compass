/** DocuRepo helpers [§6–11]: links, logical folders, filters, retention and controlled export. Pure. */
import { DOC_LABEL, DOC_TYPES, type DocType, type VaultDoc } from "../documents";
import { fyOf, type EntityProfile } from "../entities";
import type { DocLink, LinkKind } from "./types";

/** Add a link once; the file itself is never copied [§8]. */
export function addLink(links: DocLink[], l: DocLink): DocLink[] {
  return links.some((x) => x.docId === l.docId && x.kind === l.kind && x.targetId === l.targetId) ? links : [...links, l];
}
export const linksOf = (links: DocLink[], docId: string) => links.filter((l) => l.docId === docId);
export const docsFor = (links: DocLink[], kind: LinkKind, targetId: string) => links.filter((l) => l.kind === kind && l.targetId === targetId).map((l) => l.docId);

/** Entity a document belongs to: an explicit link, else a PAN/GSTIN printed in its fields. */
export function entityOfDoc(d: VaultDoc, links: DocLink[], entities: EntityProfile[]): EntityProfile | null {
  const ids = [...new Set(links.filter(x => x.docId === d.id && x.kind === 'entity').map(x => x.targetId))];
  if (ids.length) return ids.length === 1 ? entities.find(e => e.id === ids[0]) ?? null : null;
  const vals = (d.fields ?? []).map((f) => f.value.toUpperCase().replace(/\s/g, ""));
  const candidates = entities.filter(e => (e.pan && vals.some(v => v.includes(e.pan))) || e.gstins.some(g => vals.includes(g)));
  return candidates.length === 1 ? candidates[0] ?? null : null;
}

/** Logical folders — no rigid physical hierarchy [§9]. */
export type FolderBy = "entity" | "year" | "type";
export function folders(docs: VaultDoc[], by: FolderBy, links: DocLink[], entities: EntityProfile[]): { name: string; ids: string[] }[] {
  const m = new Map<string, string[]>();
  for (const d of docs) {
    const date = d.docDate ?? d.createdAt.slice(0, 10);
    const k = by === "type" ? DOC_LABEL[d.docType] : by === "year" ? `FY ${fyOf(date)}` : entityOfDoc(d, links, entities)?.name ?? "Personal / unassigned";
    m.set(k, [...(m.get(k) ?? []), d.id]);
  }
  return [...m.entries()].map(([name, ids]) => ({ name, ids })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Extra search filters [§10]: entity, FY, registration number, tenant, supplier, linked record. */
export interface RepoFilter { entityId?: string; fy?: string; reg?: string; linkKind?: LinkKind | "any"; linkTarget?: string }
export function filterRepo(docs: VaultDoc[], f: RepoFilter, links: DocLink[], entities: EntityProfile[]): VaultDoc[] {
  return docs.filter((d) => {
    if (f.entityId && entityOfDoc(d, links, entities)?.id !== f.entityId) return false;
    if (f.fy && fyOf(d.docDate ?? d.createdAt.slice(0, 10)) !== f.fy) return false;
    if (f.reg) { const r = f.reg.toUpperCase().replace(/\s/g, ""); if (!`${d.text} ${(d.fields ?? []).map((x) => x.value).join(" ")}`.toUpperCase().replace(/\s/g, "").includes(r)) return false; }
    if (f.linkKind && f.linkKind !== "any" && !links.some((l) => l.docId === d.id && l.kind === f.linkKind && (!f.linkTarget || l.targetId === f.linkTarget))) return false;
    return true;
  });
}

/** Default retention (years after the document's year) — Income-tax/GST/Companies Act practice; editable [§11]. */
export const DEFAULT_RETENTION: Partial<Record<DocType, number>> = { invoice: 8, bill: 8, receipt: 8, gst_return: 8, tax_return: 8, audited_financials: 10, trial_balance: 8, bank_statement: 8, card_statement: 8, asset_invoice: 10, property_deed: 0, incorporation: 0, pan_gst_registration: 0, lease_agreement: 8, contract: 8 };
/** 0 means keep permanently. Documents past retention are only *listed* for review — never auto-deleted. */
export function pastRetention(docs: VaultDoc[], today: string, years: Partial<Record<DocType, number>>): VaultDoc[] {
  return docs.filter((d) => {
    const y = years[d.docType] ?? DEFAULT_RETENTION[d.docType] ?? 8;
    if (!y) return false;
    const base = d.docDate ?? d.createdAt.slice(0, 10);
    const endFy = Number(fyOf(base).slice(0, 4)) + 1;
    return `${endFy + y}-03-31` < today;
  });
}

/** Export manifest for a controlled export: what is in the bundle and its source identity [§11]. */
export function exportManifest(docs: VaultDoc[], links: DocLink[], at: string) {
  return { exportedAt: at, count: docs.length, documents: docs.map((d) => ({ id: d.id, title: d.title, type: DOC_LABEL[d.docType], originalFileName: d.fileName, size: d.size, date: d.docDate, uploadedAt: d.createdAt, replaces: d.replacesId ?? null, links: linksOf(links, d.id).map((l) => `${l.kind}:${l.label}`), fields: (d.fields ?? []).map((f) => ({ label: f.label, value: f.value, originalValue: f.originalValue ?? null, page: f.page, section: f.section ?? null, quote: f.quote, confidence: f.confidence, status: f.status })) })) };
}

/** Upcoming renewals as reminder items for the shared reminder engine [§11]. */
export function renewalReminders(docs: VaultDoc[], today: string, days = 30) {
  const until = new Date(Date.parse(today) + days * 864e5).toISOString().slice(0, 10);
  return docs.filter((d) => d.expiresOn && d.expiresOn >= today && d.expiresOn <= until).map((d) => ({ key: `doc-renew:${d.id}:${d.expiresOn}`, title: `${d.title} renews ${d.expiresOn}`, date: d.expiresOn! }));
}

/**
 * Plain-language document search [§10], rule-based so results are explainable: "Krupa company invoices above
 * 1 lakh last year" → type, entity, amount and date filters, shown to the owner as editable chips.
 */
export interface NlFilters { types: DocType[]; entityId?: string; min?: number; max?: number; from?: string; to?: string; words: string[] }
export function parseDocQuery(q: string, entities: EntityProfile[], today: string): NlFilters {
  let t = ` ${q.toLowerCase()} `;
  const out: NlFilters = { types: [], words: [] };
  const amt = (n: string, unit?: string) => Number(n.replace(/,/g, "")) * (unit?.startsWith("cr") ? 1e7 : unit?.startsWith("l") ? 1e5 : unit === "k" ? 1e3 : 1);
  t = t.replace(/\b(above|over|more than|greater than|>)\s*₹?\s*([\d,.]+)\s*(lakhs?|lacs?|crores?|cr|k)?\b/g, (_, __, n, u) => { out.min = amt(n, u); return " "; });
  t = t.replace(/\b(below|under|less than|<)\s*₹?\s*([\d,.]+)\s*(lakhs?|lacs?|crores?|cr|k)?\b/g, (_, __, n, u) => { out.max = amt(n, u); return " "; });
  const fyR = (fy: string) => ({ from: `${fy.slice(0, 4)}-04-01`, to: `${Number(fy.slice(0, 4)) + 1}-03-31` });
  const cur = fyOf(today);
  const prev = `${Number(cur.slice(0, 4)) - 1}-${String(Number(cur.slice(0, 4)) % 100).padStart(2, "0")}`;
  t = t.replace(/\bfy\s*(\d{4})\s*-\s*(\d{2})\b/g, (_, a, b) => { Object.assign(out, fyR(`${a}-${b}`)); return " "; });
  t = t.replace(/\b(last|previous) (financial )?year\b/g, () => { Object.assign(out, fyR(prev)); return " "; });
  t = t.replace(/\bthis (financial )?year\b/g, () => { Object.assign(out, fyR(cur)); return " "; });
  t = t.replace(/\blast month\b/g, () => { const d = new Date(today.slice(0, 7) + "-01T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() - 1); const m = d.toISOString().slice(0, 7); out.from = `${m}-01`; out.to = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10); return " "; });
  for (const ty of DOC_TYPES) {
    const label = DOC_LABEL[ty].toLowerCase().split(/[ /]+/)[0]!;
    const word = ty.replace(/_/g, " ");
    for (const w of [word, `${word}s`, label.length >= 4 ? `${label}s` : "", label.length >= 4 ? label : ""].filter(Boolean)) {
      const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
      if (re.test(t)) { if (!out.types.includes(ty)) out.types.push(ty); t = t.replace(re, " "); }
    }
  }
  const e = entities.filter((x) => { const n = x.name.toLowerCase().split(/\s+/)[0]!; return n.length >= 3 && t.includes(` ${n}`); });
  if (e.length === 1) { out.entityId = e[0]!.id; t = t.replace(e[0]!.name.toLowerCase().split(/\s+/)[0]!, " "); }
  out.words = t.replace(/\b(company|companies|for|of|the|and|from|in|with|all|show|me|my|documents?)\b/g, " ").split(/\s+/).filter((w) => w.length >= 3);
  return out;
}
export function applyDocQuery(docs: VaultDoc[], f: NlFilters, links: DocLink[], entities: EntityProfile[]): VaultDoc[] {
  return docs.filter((d) => {
    const date = d.docDate ?? d.createdAt.slice(0, 10);
    if (f.types.length && !f.types.includes(d.docType)) return false;
    if (f.entityId && entityOfDoc(d, links, entities)?.id !== f.entityId) return false;
    if (f.min != null && !(d.amount != null && d.amount > f.min)) return false;
    if (f.max != null && !(d.amount != null && d.amount < f.max)) return false;
    if (f.from && date < f.from) return false;
    if (f.to && date > f.to) return false;
    const hay = `${d.title} ${d.merchant ?? ""} ${d.text} ${(d.fields ?? []).map((x) => x.value).join(" ")} ${linksOf(links, d.id).map((l) => l.label).join(" ")}`.toLowerCase();
    return f.words.every((w) => hay.includes(w));
  });
}

export interface ProvenanceField { label: string; value: string; printed: string | null; where: string; status: string; confidence: string }
export interface ProvenanceDoc { docId: string; title: string; docType: string; fields: ProvenanceField[] }
/**
 * Field-level provenance [§7, §15]: for one saved record, the documents linked to it and every read field
 * with where it was printed (page/section), its saved value and — when the owner corrected it — the value
 * as printed. Read-only; reports use it to show exactly where each figure came from.
 */
export function recordProvenance(targetId: string, links: DocLink[], docs: VaultDoc[]): ProvenanceDoc[] {
  const ids = [...new Set(links.filter((l) => l.targetId === targetId).map((l) => l.docId))];
  const out: ProvenanceDoc[] = [];
  for (const id of ids) {
    const d = docs.find((x) => x.id === id);
    if (!d) continue;
    out.push({
      docId: d.id, title: d.title, docType: d.docType,
      fields: (d.fields ?? []).map((f) => ({
        label: f.label, value: f.value,
        printed: f.status === "corrected" ? f.originalValue ?? null : null,
        where: f.page != null ? `page ${f.page}` : f.section ?? "",
        status: f.status, confidence: f.confidence,
      })),
    });
  }
  return out;
}
