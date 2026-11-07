import { expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { reportDocumentError } from "./report-documents";
import { appendAnnexures } from "./expenditure-pdf";
import type { Statement } from "./expenditure-statement";

it("validates actual PDF bytes and rejects empty, broken and unsupported files", async () => {
  const pdf = await PDFDocument.create(); pdf.addPage();
  const bytes = await pdf.save();
  expect(await reportDocumentError({ bytes, type: "application/pdf" })).toBeNull();
  expect(await reportDocumentError({ bytes: new Uint8Array(), type: "application/pdf" })).toBe("File unavailable or empty");
  expect(await reportDocumentError({ bytes: new Uint8Array([1, 2, 3]), type: "application/pdf" })).toBe("File could not be read");
  expect(await reportDocumentError({ bytes, type: "text/csv" })).toBe("Unsupported attachment format");
});

it("preserves original pages and inserts missing-document evidence before the annexures", async () => {
  const body = await PDFDocument.create(); body.addPage();
  const original = await PDFDocument.create(); const originalPage = original.addPage([321, 456]);
  const font = await original.embedFont(StandardFonts.Helvetica); originalPage.drawText("ORIGINAL TEST BILL 12.34", { x: 20, y: 200, font });
  const originalBytes = await original.save();
  const annexures = ["A-01", "A-02"].map((no, i) => ({ no, row: i + 1, name: `${no}.pdf`, type: "application/pdf", path: `test/${no}`, date: "2026-11-01", merchant: "Test", amount: 12.34, docType: "PDF bill", receiptIndex: 0 }));
  const result = await appendAnnexures(await body.save(), { reference: "TEST", annexures } as Statement, { "A-01": { bytes: originalBytes, type: "application/pdf" }, "A-02": null }, [{ row: 3, title: "Unattached meal", date: "2026-11-02" }]);
  expect(result.missing).toEqual(["A-02"]);
  const bytes = new Uint8Array(await new Promise<ArrayBuffer>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => { if (reader.result instanceof ArrayBuffer) resolve(reader.result); else reject(Error("No PDF bytes")); }; reader.onerror = reject; reader.readAsArrayBuffer(result.blob); }));
  const output = await PDFDocument.load(bytes);
  // Body, missing-document list, original cover, untouched original, failed-file page.
  expect(output.getPageCount()).toBe(5);
  expect(output.getPage(3).getSize()).toEqual({ width: 321, height: 456 });
  const content = Buffer.from(await output.save({ useObjectStreams: false })).toString("latin1");
  expect(content).toContain("/MediaBox [ 0 0 321 456 ]");
});
 it("decodes actual PNG/JPEG evidence and refuses truncated images", async () => {
  const png = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6L1sAAAAASUVORK5CYII=", "base64"));
  expect(await reportDocumentError({bytes:png,type:"image/png"})).toBeNull();
  expect(await reportDocumentError({bytes:new Uint8Array([137,80,78,71]),type:"image/png"})).toBe("File could not be read");
 });
