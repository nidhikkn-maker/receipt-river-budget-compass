import type { AnnexFile } from "./expenditure-pdf";

export async function reportDocumentError(file: AnnexFile | null): Promise<string | null> {
  if (!file?.bytes.byteLength) return "File unavailable or empty";
  try {
    const { PDFDocument } = await import("pdf-lib");
    if (file.type === "application/pdf") {
      const pdf = await PDFDocument.load(file.bytes);
      if (pdf.isEncrypted) return "Password-protected PDF";
      return pdf.getPageCount() > 0 ? null : "PDF has no pages";
    }
    const pdf = await PDFDocument.create();
    if (file.type === "image/png") await pdf.embedPng(file.bytes);
    else if (file.type === "image/jpeg") await pdf.embedJpg(file.bytes);
    else return "Unsupported attachment format";
    return null;
  } catch { return "File could not be read"; }
}