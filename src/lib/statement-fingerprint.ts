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

/**
 * RB-STM-01 (P0-027 residual; KK: "stable source identity including account/workspace scope and content evidence, not filename
 * alone"). The statement reference saved on an entry (expenses.statement_ref, which P7 binds as its statement_row source key per
 * owner) is derived from the line's fingerprint ONLY: statement account + date + direction + amount + bank reference or normalised
 * narration + occurrence index for identical same-day lines. The uploaded file's name is not part of it, so
 *   - identical lines in two accounts' statements uploaded under the same file name are two sources;
 *   - the same line re-downloaded under another file name for the same account is the same source.
 * Workspace scope: P7 keys sources per owner (owner_id), and the account key is the account's globally unique id, which fixes the
 * entity/workspace the account belongs to without copying an assignment that can later be edited (that would make the identity
 * unstable). The text stays readable: "Statement line · 2026-11-03 · debit 2999.00 · POS AMAZON RETAIL · #2 · account <id>".
 * References stored before this change ("<file> · <date> · <description>[ · <direction> <amount>[ · #n]]") are kept as stored and
 * still read by statementRefOrigin / isLineSourceRef.
 */
export const LINE_SOURCE_PREFIX = "Statement line · ";
const MAX_REF = 300;

/** Small synchronous 53-bit string hash (cyrb53), only used to keep an over-long narration distinct after shortening. */
function hash53(str: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

/** The stable source identity of one statement line, from its fingerprint (see fingerprintLines). Pure; same input, same text. */
export function statementLineSourceRef(fingerprint: string): string {
  const parts = fingerprint.split("|");
  if (parts.length < 5) throw Error("Not a statement line fingerprint");
  const [date, direction, amount, last] = parts.slice(-4) as [string, string, string, string];
  const account = parts.slice(0, -4).join("|");
  if (!account) throw Error("Not a statement line fingerprint");
  const m = /^(.*)#(\d+)$/.exec(last);
  const evidenceRaw = m ? m[1]! : last;
  const order = m ? Number(m[2]) : 0;
  const evidence = evidenceRaw.startsWith("R") ? `ref ${evidenceRaw.slice(1)}` : evidenceRaw.slice(1);
  const head = `${LINE_SOURCE_PREFIX}${date} · ${direction} ${amount} · `;
  const tail = `${order > 0 ? ` · #${order + 1}` : ""} · account ${account}`;
  const room = MAX_REF - head.length - tail.length;
  if (room < 20) throw Error("Statement account key is too long for a statement reference");
  const shown = evidence.length <= room ? evidence : `${evidence.slice(0, room - 16)} ~${hash53(evidence)}`;
  return `${head}${shown}${tail}`;
}

/** True for a reference written by statementLineSourceRef. Older references (file-name prefixed) return false and are kept as stored. */
export const isLineSourceRef = (ref: string | null | undefined) => !!ref && ref.startsWith(LINE_SOURCE_PREFIX);

/** Where an imported entry came from, for the Inbox wording: the statement line, or the file name an older reference starts with. */
export function statementRefOrigin(ref: string): string {
  if (isLineSourceRef(ref)) return `the statement line of ${ref.slice(LINE_SOURCE_PREFIX.length).split(" · ")[0]}`;
  return ref.split(" ·")[0]!;
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
