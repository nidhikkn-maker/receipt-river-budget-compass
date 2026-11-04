/** Applies a confirmed intake proposal to owner preferences in one write. Pure so it can be tested. */
import type { EntityProfile } from "../entities";
import type { Asset } from "../assets";
import type { BooksData, FyRecord, Lease, Property } from "./types";
import { addLink } from "./docrepo";
import { unmappedFields } from "./intake";
import type { DocType } from "../documents";

export type Confirmed =
  | { route: "entity"; profile: EntityProfile }
  | { route: "asset"; asset: Asset }
  | { route: "property"; property: Property; asset: Asset | null }
  | { route: "lease"; lease: Lease }
  | { route: "fy"; record: FyRecord }
  | { route: "document" };

export interface PrefsSlice { entities: EntityProfile[]; assets: Asset[]; books: BooksData }

const upsert = <T extends { id: string }>(list: T[], x: T) => (list.some((y) => y.id === x.id) ? list.map((y) => (y.id === x.id ? x : y)) : [...list, x]);

export function commitIntake(p: PrefsSlice, c: Confirmed, doc: { id: string; title: string; docType: DocType; fieldLabels: string[] }, today: string, newId: () => string): PrefsSlice {
  let { entities, assets, books } = p;
  books = { ...books, proposedFields: unmappedFields(doc.fieldLabels, doc.docType, books.proposedFields) };
  const link = (kind: Parameters<typeof addLink>[1]["kind"], targetId: string, label: string) => { books = { ...books, docLinks: addLink(books.docLinks, { docId: doc.id, kind, targetId, label }) }; };
  switch (c.route) {
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
    case "document": break;
  }
  void today;
  return { entities, assets, books };
}
