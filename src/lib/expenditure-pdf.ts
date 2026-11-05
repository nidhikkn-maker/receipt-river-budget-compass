import { cell as uCell, loadPdfFonts, plain, withUnicode , textU, drawTextU } from "./pdf-unicode";
// Renders a Detailed Expenditure Statement: portrait overview, landscape register, then every
// original bill as numbered annexures, merged into one PDF. Browser-only: import dynamically.
import type { Statement } from "./expenditure-statement";
import { PAYER_LABEL } from "./expenditure-statement";

export interface AnnexFile { bytes: Uint8Array; type: string }
const IN = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n = (v: number) => IN.format(Math.round(v * 100) / 100);
const ascii = uCell;
const INK: [number, number, number] = [22, 44, 110];

export async function renderStatementPdf(s: Statement, files: Record<string, AnnexFile | null>): Promise<{ blob: Blob; missing: string[] }> {
  await loadPdfFonts();
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const M = 14;
  const last = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const table = (opts: Parameters<typeof autoTable>[1]) => autoTable(doc, withUnicode(doc, { theme: "grid", margin: { left: M, right: M, top: 16, bottom: 16 }, showHead: "everyPage", rowPageBreak: "avoid",
    styles: { fontSize: 9, cellPadding: 1.5, lineColor: [205, 205, 205], lineWidth: 0.1, textColor: [25, 25, 25], overflow: "linebreak" },
    headStyles: { fillColor: [236, 239, 246], textColor: INK, fontStyle: "bold" }, footStyles: { fillColor: [245, 245, 245], textColor: [20, 20, 20], fontStyle: "bold" }, ...opts }));

  // Page 1 — overview
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...INK); doc.text("LEDGERLINE", M, 15);
  doc.setFontSize(17); textU(doc, s.title, M, 25);
  doc.setDrawColor(...INK); doc.setLineWidth(0.4); doc.line(M, 28, 196, 28);
  table({ startY: 32, theme: "plain", styles: { fontSize: 9, cellPadding: 1.1 }, columnStyles: { 0: { fontStyle: "bold", cellWidth: 42 } }, body: [
    ["Subject", s.subjectName], ["Workspace", s.workspace], ["Organisation", s.organisation], ["Purpose", s.purpose],
    ["Period", `${s.start} to ${s.end}`], ["Prepared on", s.prepared], ["Report reference", s.reference], ["Reporting currency", "INR (original currencies shown in the register)"],
  ].map((r) => r.map(ascii)) });
  const S = s.summary;
  table({ startY: last() + 5, head: [["Expenditure summary", "INR"]], columnStyles: { 1: { halign: "right" } }, body: [
    ["Total expenditure", n(S.total)], [PAYER_LABEL.personal, n(S.personal)], [PAYER_LABEL.organisation, n(S.organisation)], [PAYER_LABEL.other, n(S.other)],
    ["Allocated to business / official purposes", n(S.business)], ["Allocated to personal / family purposes", n(S.personalFamily)],
  ] });
  table({ startY: last() + 5, head: [["Payment source", "Total spent (INR)"]], columnStyles: { 1: { halign: "right" } }, body: s.sources.map((x) => [ascii(x.source), n(x.total)]), foot: [["Total", n(S.total)]] });
  table({ startY: last() + 5, head: [["Reimbursement position", "INR"]], columnStyles: { 1: { halign: "right" } }, body: [
    ["Personally funded, eligible for reimbursement", n(S.eligible)], ["Reimbursed to date", n(S.reimbursed)], ["Outstanding", n(S.outstanding)], ["Rejected / not eligible", n(S.rejected)],
  ] });

  // Page 2+ — register (landscape so columns stay readable)
  doc.addPage("a4", "landscape");
  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...INK); doc.text("Detailed expenditure register", M, 14);
  table({ startY: 18, styles: { fontSize: 8, cellPadding: 1.2, lineColor: [205, 205, 205], lineWidth: 0.1, overflow: "linebreak" },
    head: [["S.No", "Date", "Particulars", "Category", "Merchant", "Mode", "Account / card", "Paid by", "Cur.", "Original", "INR", "Allocated", "Eligible", "Reimbursed", "Outstanding", "Bill ref."]],
    body: s.rows.map((r) => [String(r.sno), r.date, r.particulars, r.category, r.merchant, r.method, r.source, r.payer, r.currency, n(r.original), n(r.inr), n(r.allocated), n(r.eligible), n(r.reimbursed), n(r.outstanding), r.billRef].map(ascii)),
    foot: [["", "", "Total", "", "", "", "", "", "", "", n(S.total), n(S.total), n(S.eligible), n(S.reimbursed), n(S.outstanding), ""]],
    columnStyles: Object.fromEntries([9, 10, 11, 12, 13, 14].map((i) => [i, { halign: "right" as const }])),
  });
  table({ startY: last() + 6, head: [["S.No", "Workspace allocation", "Business / official", "Personal / family", "Reimbursement status"]], columnStyles: { 2: { halign: "right" }, 3: { halign: "right" } },
    body: s.rows.map((r) => [String(r.sno), ascii(r.workspaces), n(r.businessShare), n(r.personalShare), r.status]) });
  const itemised = s.rows.filter((r) => r.items.length);
  if (itemised.length) table({ startY: last() + 6, head: [["S.No", "Line item", "Qty", "Amount (original currency)", "Reconciles with bill"]], columnStyles: { 3: { halign: "right" } },
    body: itemised.flatMap((r) => [...r.items.map((it, i) => [i ? "" : String(r.sno), ascii(it.name), String(it.quantity), n(it.amount), i ? "" : r.itemsReconcile ? "Yes" : "No - shown as read from the bill"]), ...r.charges.map((c) => ["", ascii(c.label), "", n(c.amount), ""]), ...(r.roundOff ? [["", "Round-off", "", n(r.roundOff), ""]] : [])]) });
  table({ startY: last() + 6, theme: "plain", head: [["Notes and disclosures"]], body: s.disclosures.map((d) => ["- " + ascii(d)]), styles: { fontSize: 8 } });

  return appendAnnexures(new Uint8Array(doc.output("arraybuffer")), s, files);
}

/** Appends every bill as numbered annexures (in register order) and page-numbers the whole PDF. */
export async function appendAnnexures(body: Uint8Array, s: Statement, files: Record<string, AnnexFile | null>): Promise<{ blob: Blob; missing: string[] }> {
  // Annexures via pdf-lib
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const out = await PDFDocument.load(body);
  const font = await out.embedFont(StandardFonts.Helvetica), bold = await out.embedFont(StandardFonts.HelveticaBold);
  const missing: string[] = [];
  const A4: [number, number] = [595.28, 841.89];
  const header = async (page: import("pdf-lib").PDFPage, a: Statement["annexures"][number], extra = "") => {
    const { height } = page.getSize();
    page.drawRectangle({ x: 0, y: height - 46, width: page.getWidth(), height: 46, color: rgb(1, 1, 1) });
    await drawTextU(out, page, `Annexure ${a.no} - Original ${a.docType}${extra}`, { x: 36, y: height - 22, size: 11, font: bold, color: rgb(0.086, 0.17, 0.43), rgb255: [22, 43, 110] });
    await drawTextU(out, page, `Transaction ${a.row} | ${a.merchant} | ${a.date} | ${n(a.amount)} | ${s.reference}`, { x: 36, y: height - 36, size: 8, font, color: rgb(0.3, 0.3, 0.3), rgb255: [77, 77, 77], maxChars: 110 });
  };
  for (const a of s.annexures) {
    const f = files[a.no];
    try {
      if (!f) throw new Error("missing");
      if (f.type === "application/pdf") {
        const src = await PDFDocument.load(f.bytes, { ignoreEncryption: true });
        const cover = out.addPage(A4); await header(cover, a); cover.drawText(`Original document follows (${src.getPageCount()} page${src.getPageCount() > 1 ? "s" : ""}).`, { x: 36, y: 760, size: 10, font });
        for (const p of await out.copyPages(src, src.getPageIndices())) out.addPage(p);
      } else {
        const img = f.type === "image/png" ? await out.embedPng(f.bytes) : await out.embedJpg(f.bytes);
        const land = img.width > img.height * 1.15;
        const page = out.addPage(land ? [A4[1], A4[0]] : A4);
        const { width, height } = page.getSize();
        const sc = Math.min((width - 60) / img.width, (height - 90) / img.height, 2);
        page.drawImage(img, { x: (width - img.width * sc) / 2, y: (height - 56 - img.height * sc) / 2 + 4, width: img.width * sc, height: img.height * sc });
        await header(page, a);
      }
    } catch {
      missing.push(a.no);
      const page = out.addPage(A4); await header(page, a, " - NOT READABLE");
      await drawTextU(out, page, `The attached file "${a.name}" could not be included. It remains stored in Ledgerline.`, { x: 36, y: 760, size: 10, font, color: rgb(0, 0, 0), rgb255: [0, 0, 0] });
    }
  }
  const total = out.getPageCount();
  for (const [i, p] of out.getPages().entries()) await drawTextU(out, p, `Ledgerline - ${s.reference} - Page ${i + 1} of ${total}`, { x: 36, y: 14, size: 7, font, color: rgb(0.5, 0.5, 0.5), rgb255: [128, 128, 128] });
  const bytes = await out.save();
  return { blob: new Blob([bytes as BlobPart], { type: "application/pdf" }), missing };
}
