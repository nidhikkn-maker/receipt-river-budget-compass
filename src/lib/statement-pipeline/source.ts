import { runningBalanceEnds } from "./running-balance";
// Reads a statement file on this device: PDF text layer, CSV or Excel. Nothing is uploaded by reading.
import { isAmex, parseAmexStatement, parseBalanceStatement, rowsFromItems } from "../statement-crosscheck";
import { parseForexStatement } from "../forex-statement";
import { readStatement } from "../statement-import";
import type { StatementLine } from "../expenses";
import { fromBalanceLines, fromForex, fromStatementLines, type StmtFile } from "./line";

const MAX_PAGES = 120;

/** Text rows of a PDF, CSV or text file, read on this device, for document-type detection. Other formats return []. */
export async function readDocRows(file: File): Promise<string[]> {
  if (/\.pdf$/i.test(file.name)) return pdfRows(file);
  if (/\.(csv|txt)$/i.test(file.name)) return (await file.text()).split(/\r?\n/).map((r) => (r.match(/("([^"]|"")*"|[^,]*)(,|$)/g) ?? [r]).map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "").trim()).filter(Boolean).join(" ")).filter(Boolean);
  return [];
}

async function pdfRows(file: File): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
  try {
    const doc = await task.promise;
    const rows: string[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      rows.push(...rowsFromItems(content.items.flatMap((i) => ("str" in i ? [{ str: i.str, x: i.transform[4] as number, y: i.transform[5] as number }] : []))));
    }
    return rows;
  } finally {
    await task.destroy();
  }
}

const fileOf = (name: string, lines: StmtFile["lines"], opening: number | null, closing: number | null, currency: string): StmtFile =>
  ({ name, accountId: null, hint: null, currency, opening, closing, lines });

/**
 * Turns one uploaded file into statement files. A multi-currency wallet statement comes back as one
 * entry per currency, because each wallet is its own balance. Rows are returned too, so the caller can
 * work out whose statement it is.
 */
/** Reads a scanned or photographed statement on the server. Lines come back without balances. */
export type ServerReader = (file: File) => Promise<StatementLine[]>;

export const isImageStatement = (name: string) => /\.(png|jpe?g|webp)$/i.test(name);

/** Scanned files carry no printed opening/closing, so nothing from them can pass the balance gate on its own. */
async function scanned(file: File, serverRead?: ServerReader) {
  if (!serverRead) throw Error(`${file.name}: this is a scanned page — it needs the server reader`);
  const lines = await serverRead(file);
  if (!lines.length) throw Error(`${file.name}: no readable entries were found on this scan`);
  return { files: [{ ...fileOf(`${file.name} (scanned)`, fromStatementLines(file.name, lines), null, null, "INR"), scanned: true }], rows: [file.name] };
}

export async function readStatementFile(file: File, serverRead?: ServerReader): Promise<{ files: StmtFile[]; rows: string[] }> {
  if (isImageStatement(file.name)) return scanned(file, serverRead);
  if (/\.pdf$/i.test(file.name)) {
    const rows = await pdfRows(file);
    if (rows.join("").replace(/\s/g, "").length < 40) return scanned(file, serverRead);
    if (isAmex(rows)) {
      const parsed = parseAmexStatement(rows, file.name);
      if (!parsed.lines.length) throw Error(`${file.name}: no entries found in this American Express layout`);
      return { files: [fileOf(file.name, fromBalanceLines(file.name, parsed.lines), parsed.opening, parsed.closing, "INR")], rows };
    }
    const wallets = parseForexStatement(rows).filter((w) => w.lines.length);
    if (wallets.length) {
      return { files: wallets.map((w) => fileOf(`${file.name} · ${w.currency}`, fromForex(file.name, w), null, w.printedBalance, w.currency)), rows };
    }
    const parsed = parseBalanceStatement(rows, file.name);
    if (!parsed.lines.length) throw Error(`${file.name}: no entries found in this layout`);
    return { files: [fileOf(file.name, fromBalanceLines(file.name, parsed.lines), parsed.opening, parsed.closing, "INR")], rows };
  }
  const lines = await readStatement(file);
  // A spreadsheet export carries no header text, so the file name is the only clue to its bank.
  // A running Balance column gives opening/closing only when every step adds up exactly.
  const ends = runningBalanceEnds(lines.map((l) => ({ amount: l.amount, direction: l.direction ?? "debit", balance: l.balance })));
  return { files: [fileOf(file.name, fromStatementLines(file.name, lines), ends?.opening ?? null, ends?.closing ?? null, "INR")], rows: [file.name] };
}
