import { describe, it, expect } from "vitest";
import { fetchPrivateFile, sha256Hex, PrivateFileError } from "./private-files";
import { readFileSync, existsSync } from "node:fs";
const fixtures = [
  ["application/pdf", Buffer.from("%PDF-1.4\n%\xe2\xe3\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF", "latin1")],
  ["text/csv", Buffer.from("Date,Narration,Amount\n2026-04-05,EMI GLS,125000\n")],
  ["image/jpeg", Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array.from({ length: 4000 }, (_, i) => i % 256), 0xff, 0xd9])],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", Buffer.from([0x50, 0x4b, 0x03, 0x04, ...Array.from({ length: 2048 }, (_, i) => (i * 7) % 256)])],
] as const;
const serve = (body: Uint8Array, status = 200, type = "application/octet-stream") => (async () => new Response(status === 200 ? body : "denied", { status, headers: { "content-type": type } })) as unknown as typeof fetch;
describe("private file download returns original bytes", () => {
  for (const [mime, bytes] of fixtures) it(`${mime} is byte-identical with checksum`, async () => {
    const want = await sha256Hex(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    const blob = await fetchPrivateFile("https://x/s", { size: bytes.byteLength, mimeType: mime, sha256: want }, serve(bytes));
    expect(blob.type).toBe(mime); expect(blob.size).toBe(bytes.byteLength);
    expect(await sha256Hex(await blob.arrayBuffer())).toBe(want);
  });
  it("rejects an empty body instead of saving an empty file", async () => {
    await expect(fetchPrivateFile("u", { size: 10 }, serve(new Uint8Array()))).rejects.toThrow("empty");
  });
  it("rejects truncated bytes and checksum mismatch", async () => {
    await expect(fetchPrivateFile("u", { size: 99 }, serve(new Uint8Array([1, 2])))).rejects.toThrow("size mismatch");
    await expect(fetchPrivateFile("u", { sha256: "00" }, serve(new Uint8Array([1])))).rejects.toBeInstanceOf(PrivateFileError);
  });
  it("expired or revoked signed URL reports ended access", async () => {
    await expect(fetchPrivateFile("u", {}, serve(new Uint8Array([1]), 400))).rejects.toThrow("Access to this file has ended");
  });
  it.skipIf(!existsSync("src/lib/statement-pipeline/__fixtures__"))("noop", () => { void readFileSync; });
});
