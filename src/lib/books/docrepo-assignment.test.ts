import { describe, expect, it } from "vitest";
import { addLink, docsFor, entityOfDoc, exportManifest, filterRepo, folders, pastRetention, recordProvenance, renewalReminders, DEFAULT_RETENTION } from "./docrepo";
import { emptyBooks } from "./types";
import type { EntityProfile } from "../entities";
import type { VaultDoc } from "../documents";

// Automatic assignment and persisted reload of document metadata from source evidence [§6–§11]:
// document type, relevant individual/company, financial year, related records, expiry and monetary
// values — including missing and ambiguous handling.

const acme: EntityProfile = { id: "ent-acme", name: "Acme Traders Private Limited", kind: "company", pan: "AAACA1234A", gstins: ["33AAACA1234A1Z5"], booksFrom: "2020-21" } as EntityProfile;

const doc = (over: Partial<VaultDoc>): VaultDoc => ({
  id: "d1", title: "Invoice", docType: "invoice", filePath: "p", fileName: "inv.pdf", mimeType: "application/pdf", size: 1000,
  docDate: "2026-05-02", amount: 1180, currency: "INR", merchant: "Acme", notes: "", text: "",
  transactionId: null, accountId: null, loanId: null, expiresOn: null, createdAt: "2026-05-03T00:00:00Z",
  ...over,
});

describe("automatic assignment from source evidence", () => {
  it("assigns the company from an explicit link, else from a PAN/GSTIN printed in the fields", () => {
    const d = doc({ id: "d1" });
    expect(entityOfDoc(d, [], [acme])).toBeNull(); // no link, no printed identity → unassigned, never guessed
    const withPan = doc({ id: "d2", fields: [{ label: "Seller GSTIN", value: "33AAACA1234A1Z5", page: 1, quote: "GSTIN: 33AAACA1234A1Z5", confidence: "high", status: "confirmed" }] });
    expect(entityOfDoc(withPan, [], [acme])?.id).toBe("ent-acme");
    const linked = addLink([], { docId: "d1", kind: "entity", targetId: "ent-acme", label: "Acme" });
    expect(entityOfDoc(d, linked, [acme])?.id).toBe("ent-acme");
  });

  it("groups documents into logical folders by type, company and financial year without moving files", () => {
    const docs = [doc({ id: "d1" }), doc({ id: "d2", docType: "bank_statement", docDate: "2025-01-10" })];
    const byType = folders(docs, "type", [], []);
    expect(byType.find((f) => f.name === "Invoice")?.ids).toEqual(["d1"]);
    const byYear = folders(docs, "year", [], []);
    expect(byYear.find((f) => f.name === "FY 2026-27")?.ids).toContain("d1");
    expect(byYear.find((f) => f.name === "FY 2024-25")?.ids).toContain("d2");
  });

  it("links a document to its related asset, property, investment, loan and transaction, and reloads them", () => {
    let links = addLink([], { docId: "d1", kind: "asset", targetId: "a1", label: "Lathe" });
    links = addLink(links, { docId: "d1", kind: "property", targetId: "p1", label: "Plot 44" });
    links = addLink(links, { docId: "d1", kind: "investment", targetId: "h1", label: "HDFC Bank" });
    links = addLink(links, { docId: "d1", kind: "loan", targetId: "l1", label: "GLS loan" });
    expect(docsFor(links, "asset", "a1")).toEqual(["d1"]);
    expect(docsFor(links, "property", "p1")).toEqual(["d1"]);
    expect(docsFor(links, "investment", "h1")).toEqual(["d1"]);
    expect(docsFor(links, "loan", "l1")).toEqual(["d1"]);
    // The same link added twice is stored once.
    expect(addLink(links, { docId: "d1", kind: "asset", targetId: "a1", label: "Lathe" })).toHaveLength(4);
  });

  it("filters the repository by company, year, registration and link target", () => {
    const docs = [doc({ id: "d1" }), doc({ id: "d2", docType: "gst_return" })];
    const links = addLink([], { docId: "d1", kind: "entity", targetId: "ent-acme", label: "Acme" });
    expect(filterRepo(docs, { entityId: "ent-acme" }, links, [acme]).map((d) => d.id)).toEqual(["d1"]);
    expect(filterRepo(docs, { fy: "2026-27" }, [], []).map((d) => d.id)).toEqual(["d1", "d2"]); // both dated May 2026
    expect(filterRepo(docs, { fy: "2024-25" }, [], [])).toEqual([]);
    expect(filterRepo(docs, { linkKind: "any" }, links, []).map((d) => d.id)).toEqual(["d1", "d2"]); // "any" = no link filter
    expect(filterRepo(docs, { linkKind: "entity" }, links, []).map((d) => d.id)).toEqual(["d1"]); // only the linked one
    expect(filterRepo(docs, { linkKind: "entity", linkTarget: "ent-acme" }, links, []).map((d) => d.id)).toEqual(["d1"]);
  });

  it("surfaces expiry/renewal dates inside the reminder window only", () => {
    const soon = doc({ id: "d1", expiresOn: "2026-11-20", title: "Vehicle insurance" });
    const later = doc({ id: "d2", expiresOn: "2027-06-01" });
    const none = doc({ id: "d3" });
    const r = renewalReminders([soon, later, none], "2026-11-07");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ key: "doc-renew:d1:2026-11-20", date: "2026-11-20" });
  });

  it("keeps monetary values as provenance with their printed quote and page, and the export manifest carries them", () => {
    const d = doc({ id: "d1", fields: [{ label: "Taxable value", value: "1050", originalValue: "1000", page: 2, quote: "Taxable value ₹1,000.00", confidence: "high", status: "corrected" }] });
    const links = addLink([], { docId: "d1", kind: "gst", targetId: "g1", label: "INV-7" });
    const prov = recordProvenance("g1", links, [d]);
    expect(prov).toHaveLength(1);
    // The saved value is the owner's correction; the printed original is preserved alongside it.
    expect(prov[0]!.fields[0]).toMatchObject({ label: "Taxable value", value: "1050", printed: "1000", where: "page 2", status: "corrected" });
    const m = exportManifest([d], links, "2026-11-07T00:00:00Z");
    expect(m.count).toBe(1);
    expect(m.documents[0]!.fields[0]).toMatchObject({ label: "Taxable value", quote: "Taxable value ₹1,000.00" });
    expect(m.documents[0]!.links).toEqual(["gst:INV-7"]);
  });

  it("applies retention per document type and never touches permanent records", () => {
    expect(DEFAULT_RETENTION.property_deed).toBe(0);
    expect(DEFAULT_RETENTION.incorporation).toBe(0);
    const old = doc({ id: "d1", docType: "invoice", docDate: "2015-04-01" });
    const deed = doc({ id: "d2", docType: "property_deed", docDate: "2010-01-01" });
    const past = pastRetention([old, deed], "2026-11-07", DEFAULT_RETENTION);
    expect(past.map((d) => d.id)).toEqual(["d1"]); // invoice past 8 years; the deed is permanent
  });

  it("empty books carry no proposed fields, links or holdings until evidence arrives", () => {
    const b = emptyBooks();
    expect(b.docLinks).toEqual([]);
    expect(b.proposedFields).toEqual([]);
    expect(b.holdings).toEqual([]);
  });
});
