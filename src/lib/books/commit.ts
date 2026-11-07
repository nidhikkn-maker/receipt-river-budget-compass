/** Applies a confirmed intake proposal to owner preferences in one write. Pure so it can be tested. */
import type { EntityProfile } from "../entities";
import type { Asset } from "../assets";
import type { Holding, Quote } from "./types";
import { upsertQuote } from "./market";
import type { BooksData, FyRecord, GstInvoice, Lease, Property, TaxCredit } from "./types";
import { addLink } from "./docrepo";
import { unmappedFields } from "./intake";
import type { DocType } from "../documents";

export type Confirmed =
  | { route: "entity"; profile: EntityProfile }
  | { route: "asset"; asset: Asset }
  | { route: "assetDocument"; assetId: string; date: string; note: string }
  | { route: "property"; property: Property; asset: Asset | null }
  | { route: "lease"; lease: Lease }
  | { route: "fy"; record: FyRecord }
  | { route: "gst"; invoice: GstInvoice }
  | { route: "tax"; entityId: string; fy: string; salary: number | null; credits: { kind: TaxCredit["kind"]; amount: number; source: string }[] }
  | { route: "fund"; holdings: Holding[]; quotes: Quote[] }
  | { route: "document" };

export interface PrefsSlice { entities: EntityProfile[]; assets: Asset[]; books: BooksData }

const upsert = <T extends { id: string }>(list: T[], x: T) => (list.some((y) => y.id === x.id) ? list.map((y) => (y.id === x.id ? x : y)) : [...list, x]);

export function commitIntake(p: PrefsSlice, c: Confirmed, doc: { id: string; title: string; docType: DocType; fieldLabels: string[] }, today: string, newId: () => string): PrefsSlice {
  let { entities, assets, books } = p;
  books = { ...books, proposedFields: unmappedFields(doc.fieldLabels, doc.docType, books.proposedFields) };
  const link = (kind: Parameters<typeof addLink>[1]["kind"], targetId: string, label: string) => { books = { ...books, docLinks: addLink(books.docLinks, { docId: doc.id, kind, targetId, label }) }; };
  switch (c.route) {
    case "assetDocument": {
      const asset = assets.find(a => a.id === c.assetId);
      if (!asset) throw new Error("Choose an existing asset for this document");
      assets = upsert(assets, { ...asset, docIds: [...new Set([...(asset.docIds ?? []), doc.id])] });
      link("asset", asset.id, asset.name);
      if (asset.ownerEntityId) link("entity", asset.ownerEntityId, "owner");
      if (doc.docType === "maintenance" && !books.assetEvents.some(e => e.assetId === asset.id && e.docId === doc.id && e.kind === "maintenance")) {
        books = { ...books, assetEvents: [...books.assetEvents, { id: newId(), assetId: asset.id, date: c.date, kind: "maintenance", note: c.note, docId: doc.id }] };
      }
      break;
    }
    case "entity": entities = upsert(entities, c.profile); link("entity", c.profile.id, c.profile.name); break;
    case "asset":
      assets = upsert(assets, c.asset); link("asset", c.asset.id, c.asset.name);
      if (!books.assetEvents.some((e) => e.assetId === c.asset.id && e.kind === "received")) books = { ...books, assetEvents: [...books.assetEvents, { id: newId(), assetId: c.asset.id, date: c.asset.inUse, kind: "received", note: `From ${doc.title}`, docId: doc.id }] };
      if (c.asset.ownerEntityId) link("entity", c.asset.ownerEntityId, "owner");
      break;
    case "property": {
      let prop = c.property;
      if (c.asset) { assets = upsert(assets, c.asset); prop = { ...prop, assetId: c.asset.id }; link("asset", c.asset.id, c.asset.name); }
      prop = { ...prop, docIds: [...new Set([...prop.docIds, doc.id])] };
      books = { ...books, properties: upsert(books.properties, prop) }; link("property", prop.id, prop.name);
      if (prop.ownerEntityId) link("entity", prop.ownerEntityId, "owner");
      break;
    }
    case "lease": {
      if (!c.lease.propertyId) throw new Error("Choose which property this lease is for");
      const dup = books.leases.find((l) => l.id !== c.lease.id && l.propertyId === c.lease.propertyId && l.tenant.toLowerCase() === c.lease.tenant.toLowerCase() && l.start === c.lease.start);
      const lease = dup ? { ...c.lease, id: dup.id } : c.lease;
      books = { ...books, leases: upsert(books.leases, lease) }; link("lease", lease.id, lease.tenant); link("property", lease.propertyId, "lease");
      break;
    }
    case "fy": books = { ...books, fyRecords: upsert(books.fyRecords, c.record) }; link("fy", c.record.id, `FY ${c.record.fy}`); link("entity", c.record.entityId, "accounts"); break;
    case "gst": {
      // Same GSTIN + party + invoice number is the same invoice: update, never duplicate.
      const key = (i: GstInvoice) => `${i.gstin}|${i.partyGstin}|${i.number.trim().toUpperCase()}`;
      const prev = books.gstInvoices.find((i) => key(i) === key(c.invoice));
      const inv = { ...c.invoice, id: prev?.id ?? c.invoice.id, docId: doc.id };
      books = { ...books, gstInvoices: upsert(books.gstInvoices, inv) }; link("gst", inv.id, `${inv.number}`);
      break;
    }
    case "tax": {
      const have = new Set((books.taxCredits ?? []).filter((x) => x.docId === doc.id).map((x) => `${x.kind}|${x.amount}`));
      const add = c.credits.filter((x) => !have.has(`${x.kind}|${x.amount}`)).map((x) => ({ id: newId(), entityId: c.entityId, fy: c.fy, kind: x.kind, amount: x.amount, source: x.source, docId: doc.id }));
      books = { ...books, taxCredits: [...(books.taxCredits ?? []), ...add], ...(c.salary != null ? { salaryEvidence: [...(books.salaryEvidence ?? []).filter((s) => !(s.entityId === c.entityId && s.fy === c.fy && s.docId === doc.id)), { entityId: c.entityId, fy: c.fy, amount: c.salary, docId: doc.id }] } : {}) };
      link("entity", c.entityId, "tax statement");
      break;
    }
    case "fund": {
      let holdings = books.holdings, quotes = books.quotes;
      for (const h of c.holdings) { holdings = upsert(holdings, h); link("investment", h.id, h.name); }
      for (const q of c.quotes) quotes = upsertQuote(quotes, q);
      books = { ...books, holdings, quotes };
      break;
    }
    case "document": break;
  }
  void today;
  return { entities, assets, books };
}
