/** Company and person profiles (v6 "Companies and past years"). Pure rules; saved in owner preferences. */
import type { ArchiveState } from "./archive";

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

/** Archive fields (P0-011) ride on the profile and are kept by cleanEntities. */
export interface EntityProfile extends ArchiveState {
  id: string;
  name: string;
  kind: EntityKind;
  pan: string;
  gstins: string[];
  /** CIN for companies, LLPIN for LLPs. */
  regNo?: string;
  /** First financial year the books start from, e.g. "2024-25". */
  booksFrom: string;
  /** Read from onboarding documents [§14]; reviewed, never typed from scratch. */
  address?: string | undefined;
  incorporatedOn?: string | undefined;
  people?: { name: string; role: string }[] | undefined;
  shareholding?: { name: string; pct: number }[] | undefined;
  activities?: string[] | undefined;
  /** Financial year end as MM-DD (India default 03-31) [§14]. */
  fyEnd?: string | undefined;
  /** Related entities printed on documents; linked only when the owner confirms [§14]. */
  related?: { name: string; relation: string; pan: string | null; cin: string | null }[] | undefined;
  /** Ids of identifiers checked against a certificate (PAN/CIN/GSTIN) [§16]. */
  verified?: string[] | undefined;
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
    const v = CHARS.indexOf(first14[i] ?? "0") * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(v / 36) + (v % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36] ?? "0";
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
  const [y = 0, m = 1] = date.split("-").map(Number);
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
    .map((x) => ({ id: x.id.slice(0, 64), name: x.name.slice(0, 120), kind: x.kind, pan: String(x.pan ?? "").toUpperCase().slice(0, 10), gstins: Array.isArray(x.gstins) ? x.gstins.filter((g) => typeof g === "string").map((g) => g.toUpperCase().slice(0, 15)).slice(0, 40) : [], ...(typeof x.regNo === "string" ? { regNo: x.regNo.slice(0, 30) } : {}), booksFrom: /^\d{4}-\d{2}$/.test(x.booksFrom) ? x.booksFrom : "2026-27",
      ...(typeof x.address === "string" ? { address: x.address.slice(0, 300) } : {}),
      ...(typeof x.incorporatedOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x.incorporatedOn) ? { incorporatedOn: x.incorporatedOn } : {}),
      ...(Array.isArray(x.people) ? { people: x.people.filter((q) => q && typeof q.name === "string").slice(0, 50).map((q) => ({ name: String(q.name).slice(0, 120), role: String(q.role ?? "").slice(0, 60) })) } : {}),
      ...(Array.isArray(x.shareholding) ? { shareholding: x.shareholding.filter((q) => q && typeof q.name === "string" && Number.isFinite(q.pct)).slice(0, 50) } : {}),
      ...(Array.isArray(x.activities) ? { activities: x.activities.filter((q) => typeof q === "string").slice(0, 20) } : {}),
      ...(typeof x.fyEnd === "string" && /^\d{2}-\d{2}$/.test(x.fyEnd) ? { fyEnd: x.fyEnd } : {}),
      ...(Array.isArray(x.related) ? { related: x.related.filter((q) => q && typeof q.name === "string").slice(0, 30).map((q) => ({ name: String(q.name).slice(0, 160), relation: String(q.relation ?? "").slice(0, 60), pan: typeof q.pan === "string" ? q.pan : null, cin: typeof q.cin === "string" ? q.cin : null })) } : {}),
      ...(Array.isArray(x.verified) ? { verified: x.verified.filter((q) => typeof q === "string").slice(0, 40) } : {}),
      // Archive status and its append-only history are shown exactly as stored (P0-011).
      ...(typeof x.archivedAt === "string" ? { archivedAt: x.archivedAt } : {}),
      ...(typeof x.archivedBy === "string" ? { archivedBy: x.archivedBy } : {}),
      ...(typeof x.archiveReason === "string" ? { archiveReason: x.archiveReason } : {}),
      ...(Array.isArray(x.archiveHistory) ? { archiveHistory: x.archiveHistory } : {}) }));
  // No count cap: every stored company stays visible. Display tidying above never reaches storage (preserve-records.ts).
}
