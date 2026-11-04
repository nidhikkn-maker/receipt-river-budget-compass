/** DocuRepo helpers [§6–11]: links, logical folders, filters, retention and controlled export. Pure. */
import { DOC_LABEL, type DocType, type VaultDoc } from "../documents";
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
  const l = links.find((x) => x.docId === d.id && x.kind === "entity");
  if (l) return entities.find((e) => e.id === l.targetId) ?? null;
  const vals = (d.fields ?? []).map((f) => f.value.toUpperCase().replace(/\s/g, ""));
  return entities.find((e) => (e.pan && vals.some((v) => v.includes(e.pan))) || e.gstins.some((g) => vals.includes(g))) ?? null;
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
  return { exportedAt: at, count: docs.length, documents: docs.map((d) => ({ id: d.id, title: d.title, type: DOC_LABEL[d.docType], originalFileName: d.fileName, size: d.size, date: d.docDate, uploadedAt: d.createdAt, replaces: d.replacesId ?? null, links: linksOf(links, d.id).map((l) => `${l.kind}:${l.label}`), fields: (d.fields ?? []).map((f) => ({ label: f.label, value: f.value, page: f.page, quote: f.quote, confidence: f.confidence, status: f.status })) })) };
}

/** Upcoming renewals as reminder items for the shared reminder engine [§11]. */
export function renewalReminders(docs: VaultDoc[], today: string, days = 30) {
  const until = new Date(Date.parse(today) + days * 864e5).toISOString().slice(0, 10);
  return docs.filter((d) => d.expiresOn && d.expiresOn >= today && d.expiresOn <= until).map((d) => ({ key: `doc-renew:${d.id}:${d.expiresOn}`, title: `${d.title} renews ${d.expiresOn}`, date: d.expiresOn! }));
}
