import { describe, expect, it } from "vitest";
import { applyDocQuery, parseDocQuery } from "./docrepo";
import type { VaultDoc } from "../documents";

const doc = (id: string): VaultDoc => ({ id, title: "Scan", docType: "invoice", text: "", createdAt: "2026-05-01T00:00:00Z", fields: [] } as unknown as VaultDoc);

describe("document search by linked records", () => {
  it("finds a document by the name of the property it is linked to", () => {
    const links = [{ docId: "a", kind: "property" as const, targetId: "p1", label: "Anna Nagar flat" }];
    const f = parseDocQuery("anna nagar", [], "2026-11-05");
    expect(applyDocQuery([doc("a"), doc("b")], f, links, []).map((d) => d.id)).toEqual(["a"]);
  });
});
