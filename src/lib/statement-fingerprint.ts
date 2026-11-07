// Fingerprints for statement lines so repeated uploads of overlapping statements only bring in new lines (pure, tested).
import type { StatementLine } from "./expenses";

/** Bank reference numbers (UPI RRN, IMPS, cheque) are 10+ digit runs in the narration. */
export function bankRef(description: string): string | null {
  const m = description.match(/\d{10,}/g);
  return m ? m.reduce((a, b) => (b.length > a.length ? b : a)) : null;
}

const clean = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

/** One fingerprint per line. Identical lines on the same day are told apart by their order within that day. */
export function fingerprintLines(lines: StatementLine[], accountKey: string): string[] {
  const seen = new Map<string, number>();
  return lines.map((l) => {
    const ref = bankRef(l.description);
    const base = `${accountKey}|${l.date}|${l.direction ?? "debit"}|${l.amount.toFixed(2)}|${ref ? `R${ref}` : `D${clean(l.description)}`}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return ref ? base : `${base}#${n}`;
  });
}

export interface SplitResult {
  fresh: StatementLine[];
  alreadyImported: StatementLine[];
  /** New lines dated on/before the latest already-imported date — shown for a quick look, never dropped. */
  olderUnseen: StatementLine[];
  fingerprints: Map<string, string>;
}

/** Separate lines already brought in by an earlier upload from new ones. */
export function splitNewLines(lines: StatementLine[], accountKey: string, known: Set<string>, importedUpTo: string | null): SplitResult {
  const fps = fingerprintLines(lines, accountKey);
  const out: SplitResult = { fresh: [], alreadyImported: [], olderUnseen: [], fingerprints: new Map() };
  lines.forEach((l, i) => {
    const fp = fps[i]!;
    out.fingerprints.set(l.ref, fp);
    if (known.has(fp)) out.alreadyImported.push(l);
    else {
      out.fresh.push(l);
      if (importedUpTo && l.date < importedUpTo) out.olderUnseen.push(l);
    }
  });
  return out;
}

/** "HDFC_Statement_21012026.csv" and "HDFC_Statement_22012026.csv" share a pattern so the account can be remembered. */
export function filePattern(name: string): string {
  return name.toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[\d_\-\s.()]+/g, " ").trim();
}
