import { describe, expect, it } from "vitest";
import { sharedKind, validBatch } from "./shared-files";

describe("shared files", () => {
  it("routes images to receipt reading and PDFs to documents", () => {
    expect(sharedKind("image/jpeg")).toBe("receipt");
    expect(sharedKind("application/pdf")).toBe("document");
    expect(sharedKind("text/html")).toBe("unsupported");
  });
  it("accepts only numeric batch ids so a link cannot read other cache entries", () => {
    expect(validBatch("1762530000000")).toBe(true);
    expect(validBatch("../x")).toBe(false);
    expect(validBatch(undefined)).toBe(false);
  });
});
