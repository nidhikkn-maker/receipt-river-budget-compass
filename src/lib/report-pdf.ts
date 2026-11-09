import { cell as uCell, loadPdfFonts, plain, withUnicode , textU } from "./pdf-unicode";
// Renders a ReportDoc to an A4 PDF with jsPDF. Browser-only: import dynamically.
import type { ReportDoc } from "./report-centre";

export type PdfStyle = "colour" | "mono";
const BRAND: [number, number, number] = [22, 44, 110]; // Thapal deep blue
const GOLD: [number, number, number] = [196, 152, 52];

export async function renderReportPdf(r: ReportDoc, style: PdfStyle, generatedAt: Date): Promise<Blob> {
  await loadPdfFonts();
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: r.landscape ? "landscape" : "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 14;
  const ink: [number, number, number] = style === "mono" ? [20, 20, 20] : BRAND;
  const accent: [number, number, number] = style === "mono" ? [90, 90, 90] : GOLD;
  const stamp = generatedAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  const ascii = uCell;

  // Header block
  doc.setFillColor(...ink); doc.roundedRect(M, 12, 9, 9, 1.5, 1.5, "F");
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("L", M + 3.1, 18.2);
  doc.setTextColor(...ink); doc.setFontSize(11); doc.text("Thapal", M + 12, 18.2);
  doc.setDrawColor(...accent); doc.setLineWidth(0.6); doc.line(M, 24, W - M, 24);
  doc.setFontSize(18); textU(doc, r.title, M, 33);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(70, 70, 70);
  let y = 39;
  for (const line of [`Reporting period: ${r.period}`, ...r.filterLines, `Generated: ${stamp}`]) { textU(doc, line, M, y); y += 4.5; }
  y += 2;

  if (r.summary.length) {
    autoTable(doc, withUnicode(doc, { startY: y, margin: { left: M, right: M }, theme: "plain", head: [["Executive summary", ""]], body: r.summary.map(([a, b]) => [ascii(a), ascii(b)]),
      headStyles: { fontStyle: "bold", textColor: ink, fontSize: 11 }, styles: { fontSize: 9, cellPadding: 1.6 }, columnStyles: { 1: { halign: "right", fontStyle: "bold" } } }));
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }

  for (const s of r.sections) {
    if (y > H - 40) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...ink); textU(doc, s.title, M, y); y += 2;
    if (s.chart?.some((c) => c.value > 0)) {
      const max = Math.max(...s.chart.map((c) => c.value)), bw = (W - 2 * M) * 0.55;
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(60, 60, 60);
      for (const c of s.chart) { y += 4.6; textU(doc, c.label.slice(0, 28), M, y, { maxW: 46 }); doc.setFillColor(...(style === "mono" ? [120, 120, 120] as [number, number, number] : accent)); doc.rect(M + 48, y - 2.8, Math.max(0.4, bw * (c.value / max)), 3, "F"); }
      y += 4;
    }
    const cols = Object.fromEntries((s.align ?? []).map((a, i) => [i, { halign: a === "r" ? "right" as const : "left" as const }]));
    autoTable(doc, withUnicode(doc, {
      startY: y + 1, margin: { left: M, right: M, top: 18, bottom: 16 }, head: [s.headers.map(ascii)],
      body: s.rows.length ? s.rows.map((row) => row.map(ascii)) : [[{ content: "No records for this selection.", colSpan: s.headers.length, styles: { fontStyle: "italic", textColor: [110, 110, 110] } }]],
      ...(s.total ? { foot: [s.total.map(ascii)] } : {}), showHead: "everyPage", showFoot: "lastPage", rowPageBreak: "avoid",
      styles: { fontSize: s.wide ? 7 : 8, cellPadding: 1.4, overflow: "linebreak", lineColor: [220, 220, 220], lineWidth: 0.1 },
      headStyles: style === "mono" ? { fillColor: [235, 235, 235], textColor: [20, 20, 20] } : { fillColor: BRAND, textColor: [255, 255, 255] },
      footStyles: { fillColor: [245, 245, 245], textColor: [20, 20, 20], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [250, 250, 250] }, columnStyles: cols,
      didParseCell: (h) => { if (s.align?.[h.column.index] === "r") h.cell.styles.halign = "right"; },
    }));
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  if (r.notes.length) {
    if (y > H - 50) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...ink); doc.text("Notes and assumptions", M, y); y += 5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(60, 60, 60);
    for (const n of r.notes) { const lines = doc.splitTextToSize(`• ${plain(n)}`.replace("•", "-"), W - 2 * M); if (y + lines.length * 4 > H - 16) { doc.addPage(); y = 20; } doc.text(lines, M, y); y += lines.length * 4 + 1.2; }
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(130, 130, 130);
    textU(doc, `Thapal - ${r.title} - ${r.period}`, M, H - 8, { maxW: 150 });
    doc.text(`Page ${i} of ${pages}`, W - M, H - 8, { align: "right" });
  }
  return doc.output("blob");
}
