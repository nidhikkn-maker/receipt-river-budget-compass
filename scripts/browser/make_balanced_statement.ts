// Builds a small balance-column bank statement PDF (opening 1,000 → closing 270) for the Statement Desk check.
import { jsPDF } from "jspdf";
const rows: string[][] = [
  ["Opening Balance", "Total Debit", "Total Credit", "Closing Balance"],
  ["1,000.00", "730.00", "0.00", "270.00"],
  ["Opening Balance", "1,000.00"],
  ["SWIGGY ORDER"],
  ["02-Oct-2026", "02-Oct-2026", "250.00", "750.00"],
  ["AMAZON PURCHASE"],
  ["03-Oct-2026", "03-Oct-2026", "480.00", "270.00"],
];
const doc = new jsPDF({ unit: "mm", format: "a4" });
doc.setFontSize(10);
rows.forEach((parts, i) => parts.forEach((p, j) => doc.text(p, 14 + j * 45, 20 + i * 8)));
await Bun.write(process.argv[2] ?? "/tmp/browser/statement-desk-tests/balanced.pdf", doc.output("arraybuffer"));
