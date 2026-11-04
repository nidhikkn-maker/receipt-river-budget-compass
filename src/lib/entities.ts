/** Company and person profiles (v6 "Companies and past years"). Pure rules; saved in owner preferences. */

export const ENTITY_KINDS = {
  individual: { label: "Individual", panType: "P" },
  huf: { label: "HUF", panType: "H" },
  proprietorship: { label: "Proprietorship", panType: "P" },
  partnership: { label: "Partnership firm", panType: "F" },
  llp: { label: "LLP", panType: "F" },
  company: { label: "Company", panType: "C" },
  trust: { label: "Trust", panType: "T" },
} as const;
export type EntityKind = keyof typeof ENTITY_KINDS;

export interface EntityProfile {
  id: string;
  name: string;
  kind: EntityKind;
  pan: string;
  gstins: string[];
  /** CIN for companies, LLPIN for LLPs. */
  regNo?: string;
  /** First financial year the books start from, e.g. "2024-25". */
  booksFrom: string;
}

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function panProblem(pan: string, kind: EntityKind): string | null {
  const p = pan.trim().toUpperCase();
  if (!p) return "PAN is needed";
  if (!PAN_RE.test(p)) return "PAN should look like ABCDE1234F";
  if (p[3] !== ENTITY_KINDS[kind].panType) return `4th letter is ${p[3]}; a ${ENTITY_KINDS[kind].label} PAN has ${ENTITY_KINDS[kind].panType}`;
  return null;
}

/** Official GSTIN check character (mod-36). */
export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = CHARS.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(v / 36) + (v % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
}

export function gstinProblem(gstin: string, pan: string): string | null {
  const g = gstin.trim().toUpperCase();
  if (!GSTIN_RE.test(g)) return "GSTIN should be 15 characters like 33ABCDE1234F1Z5";
  const state = Number(g.slice(0, 2));
  if (state < 1 || state > 38 && state !== 97 && state !== 99) return "First two digits are not a valid state code";
  if (g.slice(2, 12) !== pan.trim().toUpperCase()) return "GSTIN does not contain this PAN";
  if (gstinCheckChar(g.slice(0, 14)) !== g[14]) return "Last character fails the GSTIN check — likely a typo";
  return null;
}

/** Indian financial year label for a date (Apr–Mar). */
export function fyOf(date: string): string {
  const [y, m] = date.split("-").map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export function fyRange(fy: string): { start: string; end: string } {
  const s = Number(fy.slice(0, 4));
  return { start: `${s}-04-01`, end: `${s + 1}-03-31` };
}

/** Every financial year from booksFrom up to the one containing today. */
export function yearsSince(booksFrom: string, today: string): string[] {
  const last = Number(fyOf(today).slice(0, 4));
  const out: string[] = [];
  for (let s = Number(booksFrom.slice(0, 4)); s <= last && out.length < 30; s++) out.push(`${s}-${String((s + 1) % 100).padStart(2, "0")}`);
  return out;
}

export interface YearStatus { fy: string; entries: number; statements: number; documents: number; state: "empty" | "started" | "covered" }

/** Onboarding status per year, counted from saved records only — never assumes a year is complete. */
export function yearStatuses(booksFrom: string, today: string, entryDates: string[], statementDates: string[], docDates: string[]): YearStatus[] {
  const count = (dates: string[]) => { const m = new Map<string, number>(); for (const d of dates) if (d) m.set(fyOf(d), (m.get(fyOf(d)) ?? 0) + 1); return m; };
  const e = count(entryDates), s = count(statementDates), d = count(docDates);
  return yearsSince(booksFrom, today).map((fy) => {
    const entries = e.get(fy) ?? 0, statements = s.get(fy) ?? 0, documents = d.get(fy) ?? 0;
    return { fy, entries, statements, documents, state: entries + statements + documents === 0 ? "empty" : statements > 0 && entries > 0 ? "covered" : "started" };
  });
}

export function cleanEntities(raw: unknown): EntityProfile[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is EntityProfile => !!x && typeof x.id === "string" && typeof x.name === "string" && x.kind in ENTITY_KINDS)
    .map((x) => ({ id: x.id.slice(0, 64), name: x.name.slice(0, 120), kind: x.kind, pan: String(x.pan ?? "").toUpperCase().slice(0, 10), gstins: Array.isArray(x.gstins) ? x.gstins.filter((g) => typeof g === "string").map((g) => g.toUpperCase().slice(0, 15)).slice(0, 40) : [], regNo: typeof x.regNo === "string" ? x.regNo.slice(0, 30) : undefined, booksFrom: /^\d{4}-\d{2}$/.test(x.booksFrom) ? x.booksFrom : "2026-27" }))
    .slice(0, 50);
}
