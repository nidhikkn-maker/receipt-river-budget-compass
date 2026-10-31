import { cell as uCell, loadPdfFonts, plain, withUnicode , textU } from "./pdf-unicode";
// Renders the Expense Claim Submission Report: claim form, itemised claim, declaration and
// approval blocks, then the supporting bills as annexures. Browser-only: import dynamically.
import type { Claim } from "./expense-claim";
import { appendAnnexures, type AnnexFile } from "./expenditure-pdf";
import type { Statement } from "./expenditure-statement";

const IN = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n = (v: number) => IN.format(Math.round(v * 100) / 100);
const ascii = uCell;
const INK: [number, number, number] = [22, 44, 110];

export type ClaimFormat = "detailed" | "summary";

/** Category totals used by the shorter Summary + Bills format. */
export function claimCategoryTotals(c: Claim) {
  const m = new Map<string, { count: number; eligible: number; received: number; claimed: number; bills: string[] }>();
  for (const i of c.items) {
    const r = m.get(i.category) ?? { count: 0, eligible: 0, received: 0, claimed: 0, bills: [] };
    r.count++; r.eligible += i.eligible; r.received += i.reimbursed; r.claimed += i.claimed; if (i.billRef && i.billRef !== "-") r.bills.push(i.billRef);
    m.set(i.category, r);
  }
  return [...m.entries()].sort((a, b) => b[1].claimed - a[1].claimed).map(([category, r]) => ({ category, ...r }));
}

export async function renderClaimPdf(c: Claim, files: Record<string, AnnexFile | null>, format: ClaimFormat = "detailed") {
  await loadPdfFonts();
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const M = 14;
  const last = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const table = (o: Parameters<typeof autoTable>[1]) => autoTable(doc, withUnicode(doc, { theme: "grid", margin: { left: M, right: M, top: 16, bottom: 16 }, showHead: "everyPage", rowPageBreak: "avoid",
    styles: { fontSize: 8, cellPadding: 1.5, lineColor: [200, 200, 200], lineWidth: 0.1, textColor: [25, 25, 25], overflow: "linebreak" },
    headStyles: { fillColor: [236, 239, 246], textColor: INK, fontStyle: "bold" }, footStyles: { fillColor: [245, 245, 245], textColor: [20, 20, 20], fontStyle: "bold" }, ...o }));

  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...INK); doc.text("LEDGERLINE", M, 15);
  doc.setFontSize(16); doc.text("Expense Claim Submission", M, 25);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(80, 80, 80); textU(doc, `To: ${c.organisation} - Accounts Department`, M, 31);
  doc.setDrawColor(...INK); doc.setLineWidth(0.4); doc.line(M, 34, 196, 34);
  const k = c.claimant;
  table({ startY: 38, theme: "plain", styles: { fontSize: 8.5, cellPadding: 1.1 }, columnStyles: { 0: { fontStyle: "bold", cellWidth: 38 }, 2: { fontStyle: "bold", cellWidth: 34 } }, body: [
    ["Claimant", k.name, "Claim reference", c.reference], ["Employee ID", k.employeeId || "-", "Date of claim", c.prepared], ["Department", k.department || "-", "Activity", c.subjectName],
    ["Designation", k.designation || "-", "Period", `${c.start} to ${c.end}`], ["Email", k.email || "-", "Purpose", c.purpose],
  ].map((r) => r.map(ascii)) });
  table({ startY: last() + 4, head: [["Claim summary", "INR"]], columnStyles: { 1: { halign: "right" } }, body: [["Eligible personally-funded expenditure", n(c.totals.eligible)], ["Less: already reimbursed", n(c.totals.received)]], foot: [["Amount claimed", n(c.totals.claimed)]] });
  if (format === "summary") {
    table({ startY: last() + 4, head: [["Category", "Items", "INR", "Received", "Claimed", "Bills"]], columnStyles: Object.fromEntries([1, 2, 3, 4].map((x) => [x, { halign: "right" as const }])),
      body: claimCategoryTotals(c).map((r) => [r.category, String(r.count), n(r.eligible), n(r.received), n(r.claimed), r.bills.join(", ") || "-"].map(ascii)),
      foot: [["Total", String(c.items.length), n(c.totals.eligible), n(c.totals.received), n(c.totals.claimed), ""]] });
  } else {
    table({ startY: last() + 4,
      head: [["No.", "Date", "Particulars", "Category", "Merchant", "Paid via", "Cur.", "Original", "INR", "Received", "Claimed", "Bill"]],
      body: c.items.map((i) => [String(i.claimNo), i.date, i.particulars, i.category, i.merchant, `${i.method} - ${i.source}`, i.currency, n(i.original), n(i.eligible), n(i.reimbursed), n(i.claimed), i.billRef].map(ascii)),
      foot: [["", "", "Total", "", "", "", "", "", n(c.totals.eligible), n(c.totals.received), n(c.totals.claimed), ""]],
      styles: { fontSize: 6.8, cellPadding: 1.1, lineColor: [200, 200, 200], lineWidth: 0.1, overflow: "linebreak" }, columnStyles: Object.fromEntries([7, 8, 9, 10].map((x) => [x, { halign: "right" as const }])) });
  }
  if (k.bankDetails.trim()) table({ startY: last() + 4, theme: "plain", head: [["Pay reimbursement to"]], body: [[ascii(k.bankDetails)]] });
  if (format === "detailed" && c.excluded.length) table({ startY: last() + 4, head: [["Not claimed (for reference)", "INR", "Reason"]], columnStyles: { 1: { halign: "right" } }, styles: { fontSize: 7.5, textColor: [90, 90, 90] }, body: c.excluded.map((x) => [ascii(`${x.row.date} ${x.row.merchant}`), n(x.row.inr), x.reason]) });

  let y = last() + 8; if (y > 230) { doc.addPage(); y = 20; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...INK); doc.text("Declaration", M, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(40, 40, 40);
  const decl = doc.splitTextToSize("I certify that the expenses claimed above were incurred by me for the stated official purpose, have been paid personally, have not been claimed or reimbursed elsewhere, and that the attached bills are genuine.", 182);
  doc.text(decl, M, y + 5); y += 5 + decl.length * 4 + 12;
  const sig = (x: number, label: string, name = "") => { doc.line(x, y, x + 55, y); doc.text(label, x, y + 4); if (name) textU(doc, name, x, y + 8, { maxW: 55 }); doc.text("Date: ____________", x, y + 13); };
  doc.setDrawColor(120, 120, 120); doc.setLineWidth(0.2);
  sig(M, "Claimant signature", k.name); sig(M + 63, "Approved by", k.approver); sig(M + 126, "Accounts / Finance");
  return appendAnnexures(new Uint8Array(doc.output("arraybuffer")), { reference: c.reference, annexures: c.annexures } as Statement, files);
}
