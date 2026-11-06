import { describe, expect, it } from "vitest";
import { dropEntity, linkAccounts, looksLikeBusiness, matchEntityByName, mergeEntity, ownerOf, stubEntity, unlinkAccount } from "./entity-accounts";

describe("company account links", () => {
  it("one company can hold many accounts", () => {
    const m = linkAccounts({}, "c1", ["a1", "a2", "a3"]);
    expect(m["c1"]).toEqual(["a1", "a2", "a3"]);
  });
  it("an account belongs to one company; linking elsewhere moves it", () => {
    const m = linkAccounts(linkAccounts({}, "c1", ["a1", "a2"]), "c2", ["a1"]);
    expect(ownerOf(m, "a1")).toBe("c2");
    expect(m["c1"]).toEqual(["a2"]);
  });
  it("unlink and personal leave the account free", () => {
    expect(ownerOf(unlinkAccount({ c1: ["a1"] }, "a1"), "a1")).toBeNull();
    expect(linkAccounts({ c1: ["a1"] }, null, ["a1"])).toEqual({});
  });
  it("delete company drops links only; merge moves them", () => {
    expect(dropEntity({ c1: ["a1"], c2: ["a2"] }, "c1")).toEqual({ c2: ["a2"] });
    expect(mergeEntity({ c1: ["a1"], c2: ["a2"] }, "c1", "c2")).toEqual({ c2: ["a2", "a1"] });
  });
  it("stub needs nothing", () => {
    const s = stubEntity("", "company", "2026-11-05");
    expect(s.name).toBe("Unnamed company");
    expect(s.pan).toBe("");
    expect(s.booksFrom).toBe("2026-27");
  });
  it("detects business holders and matches names", () => {
    expect(looksLikeBusiness("KRUPA TRADERS PVT LTD")).toBe(true);
    expect(looksLikeBusiness("KRUPANIDHI KARUNANITHI")).toBe(false);
    expect(matchEntityByName([stubEntity("Krupa Traders Private Limited")], "M/S KRUPA TRADERS PVT LTD")?.name).toBe("Krupa Traders Private Limited");
  });
});

import { companyDocuments } from "./entity-accounts";
describe("companyDocuments", () => {
  const map = { c1: ["a1"], c2: ["a2"] };
  const docs = [
    { id: "d1", accountId: "a1", entityId: null }, { id: "d2", accountId: "a2", entityId: null },
    { id: "d3", accountId: null, entityId: "c1" }, { id: "d4", accountId: "a1", entityId: "c2" }, { id: "d5", accountId: null, entityId: null },
  ];
  it("lists tagged documents and suggests only untagged ones from the company's own accounts", () => {
    const r = companyDocuments(docs, map, "c1");
    expect(r.tagged.map((d) => d.id)).toEqual(["d3"]);
    expect(r.suggested.map((d) => d.id)).toEqual(["d1"]);
  });
  it("never suggests a document already tagged to another company or a personal one", () => {
    expect(companyDocuments(docs, map, "c2").suggested.map((d) => d.id)).toEqual(["d2"]);
  });
});
