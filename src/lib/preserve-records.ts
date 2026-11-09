// Lossless persistence for owner preferences (V4 FND-05 historical integrity; REQ-SEC "no silent deletion").
//
// normalizePreferences() produces a VIEW the screens can rely on: invalid records are hidden and some values
// are tidied (trimmed text, clamped percentages, defaults). That view must never be written back as if it were
// the stored data. preserveForSave() turns the view the app wants to save into the exact data to store:
//   * any section the owner did not change is written back byte-for-byte as it was stored;
//   * in a section the owner did change, every record the owner did not touch is written back exactly as stored,
//     records the app could not read are kept (never dropped), and only genuinely edited/added/removed records change;
//   * if an edit replaces a record whose stored form had been tidied for display, the stored original is copied to
//     preservedRecords so nothing the owner never saw is lost.
import { normalizePreferences, type FinancePreferences } from "./preferences";

export interface PreservedRecord { path: string; reason: "replaced-after-display-adjustment" | "unreadable-archive"; savedAt: string; record: unknown }

type Json = unknown;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Stable JSON: object keys sorted, so equal content compares equal regardless of key order. */
export function canonical(v: Json): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (isObj(v)) return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
  return JSON.stringify(v === undefined ? null : v);
}

/** True when every value present in `a` is present and equal in `b` (b may add fields, e.g. display defaults). */
export function containedIn(a: Json, b: Json): boolean {
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => containedIn(x, b[i]));
  if (isObj(a)) return isObj(b) && Object.entries(a).every(([k, v]) => v === undefined || containedIn(v, b[k]));
  return canonical(a) === canonical(b);
}

const recordKey = (x: unknown): string => (isObj(x) && typeof x["id"] === "string" ? `id:${x["id"]}` : isObj(x) && typeof x["key"] === "string" && !("id" in x) ? `key:${x["key"]}` : `c:${canonical(x)}`);

function queues(list: unknown[]): Map<string, unknown[]> {
  const m = new Map<string, unknown[]>();
  for (const x of list) { const k = recordKey(x); m.set(k, [...(m.get(k) ?? []), x]); }
  return m;
}

/**
 * Reconcile one stored list with the list the app wants to save.
 * raw = stored list, view = what the app showed (normalised from raw), next = what the app now wants stored.
 */
export function reconcileList(path: string, raw: unknown, view: unknown, next: unknown, archive: PreservedRecord[], now: string): unknown {
  if (!Array.isArray(raw)) return raw === undefined || canonical(view) !== canonical(next) ? next : raw;
  if (canonical(view) === canonical(next)) return raw;
  if (!Array.isArray(next)) return next;
  const viewList = Array.isArray(view) ? view : [];
  // Pair each displayed record with the stored record it came from (same identity, in order).
  const rawQ = queues(raw), viewQ = queues(viewList);
  const pairs = new Map<string, { raw: unknown; view: unknown }[]>();
  for (const [k, vs] of viewQ) {
    const rs = rawQ.get(k) ?? [];
    pairs.set(k, vs.map((v, i) => ({ raw: rs[i] !== undefined ? rs[i] : v, view: v })));
  }
  const used = new Set<unknown>();
  const out = next.map((n) => {
    const cand = (pairs.get(recordKey(n)) ?? []).find((p) => !used.has(p.raw) && canonical(p.view) === canonical(n));
    if (cand) { used.add(cand.raw); return cand.raw; }
    return n;
  });
  // Stored originals that were tidied for display and are now replaced or removed: keep a copy.
  for (const ps of pairs.values()) for (const p of ps) {
    if (!used.has(p.raw) && !containedIn(p.raw, p.view)) archive.push({ path, reason: "replaced-after-display-adjustment", savedAt: now, record: p.raw });
  }
  // Stored records the app could not read were never shown, so they cannot have been edited: keep them.
  const shown = new Set<unknown>([...pairs.values()].flat().map((p) => p.raw));
  const nextKeys = new Set(out.map(recordKey));
  for (const r of raw) if (!shown.has(r) && !nextKeys.has(recordKey(r))) out.push(r);
  return out;
}

/** Reconcile a keyed map section (e.g. books.entityAccounts) the same way. */
export function reconcileMap(raw: unknown, view: unknown, next: unknown): unknown {
  if (!isObj(raw)) return raw === undefined || canonical(view) !== canonical(next) ? next : raw;
  if (canonical(view) === canonical(next)) return raw;
  if (!isObj(next)) return next;
  const v = isObj(view) ? view : {};
  const out: Record<string, unknown> = {};
  for (const [k, n] of Object.entries(next)) out[k] = k in raw && k in v && canonical(v[k]) === canonical(n) ? raw[k] : n;
  for (const [k, r] of Object.entries(raw)) if (!(k in v) && !(k in out)) out[k] = r;
  return out;
}

const LIST_SECTIONS = ["assets", "entities", "receivables", "payees", "statementUploads", "decisions", "contractObligations", "allocationPlans", "trips", "merchantGroupingHistory", "preservedRecords"] as const;
const MAP_SECTIONS = ["statementBatches"] as const;
const BOOK_MAPS = ["entityAccounts", "fieldMappings", "retentionYears"] as const;

/**
 * The data to store when the app saves `next`, given what is currently stored (`stored`, exactly as read).
 * Never drops a stored record the owner did not delete, and never rewrites one the owner did not edit.
 */
export function preserveForSave(stored: Record<string, unknown> | null | undefined, next: FinancePreferences, now = new Date().toISOString()): FinancePreferences {
  const raw = (stored ?? {}) as Record<string, unknown>;
  const base = normalizePreferences(raw as Partial<FinancePreferences>) as unknown as Record<string, unknown>;
  const n = next as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { ...n };
  const archive: PreservedRecord[] = [];
  for (const k of Object.keys(n)) {
    if (!(k in raw)) continue;
    if (canonical(n[k]) === canonical(base[k])) { out[k] = raw[k]; continue; }
    if ((LIST_SECTIONS as readonly string[]).includes(k)) out[k] = reconcileList(k, raw[k], base[k], n[k], archive, now);
    else if ((MAP_SECTIONS as readonly string[]).includes(k)) out[k] = reconcileMap(raw[k], base[k], n[k]);
  }
  // Keys stored but absent from the app's object (unknown/newer fields) stay as stored.
  for (const k of Object.keys(raw)) if (!(k in out)) out[k] = raw[k];
  if (isObj(raw["books"]) && isObj(n["books"]) && canonical(n["books"]) !== canonical(base["books"])) {
    const rb = raw["books"], vb = isObj(base["books"]) ? base["books"] : {}, nb = n["books"];
    const ob: Record<string, unknown> = { ...nb };
    for (const k of Object.keys(nb)) {
      if (!(k in rb)) continue;
      if (canonical(nb[k]) === canonical(vb[k])) { ob[k] = rb[k]; continue; }
      if (Array.isArray(rb[k]) || Array.isArray(nb[k])) ob[k] = reconcileList(`books.${k}`, rb[k], vb[k], nb[k], archive, now);
      else if ((BOOK_MAPS as readonly string[]).includes(k)) ob[k] = reconcileMap(rb[k], vb[k], nb[k]);
    }
    for (const k of Object.keys(rb)) if (!(k in ob)) ob[k] = rb[k];
    // A stored gold rate the app could not read is kept unless the owner set a new one.
    if ("goldRate" in rb && !("goldRate" in vb) && !("goldRate" in nb)) ob["goldRate"] = rb["goldRate"];
    out["books"] = ob;
  }
  if (archive.length) {
    const cur = out["preservedRecords"];
    const existing: unknown[] = Array.isArray(cur) ? cur : cur === undefined ? [] : [{ path: "preservedRecords", reason: "unreadable-archive", savedAt: now, record: cur }];
    const seen = new Set(existing.map((r) => canonical(isObj(r) ? { path: r["path"], record: r["record"] } : r)));
    const added = archive.filter((a) => { const c = canonical({ path: a.path, record: a.record }); if (seen.has(c)) return false; seen.add(c); return true; });
    out["preservedRecords"] = [...existing, ...added];
  }
  return out as unknown as FinancePreferences;
}

export interface UnreadableRecord { path: string; index: number | string; record: unknown }
/** Stored records the app cannot display (kept in storage, listed for the owner to review). */
export function unreadableRecords(stored: Record<string, unknown> | null | undefined): UnreadableRecord[] {
  const raw = (stored ?? {}) as Record<string, unknown>;
  const base = normalizePreferences(raw as Partial<FinancePreferences>) as unknown as Record<string, unknown>;
  const found: UnreadableRecord[] = [];
  const scan = (path: string, r: unknown, v: unknown) => {
    if (Array.isArray(r)) {
      const shown = queues(Array.isArray(v) ? v : []);
      r.forEach((x, i) => { const q = shown.get(recordKey(x)); if (q?.length) q.shift(); else found.push({ path, index: i, record: x }); });
    } else if (isObj(r) && isObj(v)) {
      for (const [k, x] of Object.entries(r)) if (!(k in v)) found.push({ path, index: k, record: x });
    }
  };
  for (const k of [...LIST_SECTIONS, ...MAP_SECTIONS]) if (k in raw && k !== "preservedRecords") scan(k, raw[k], base[k]);
  if (isObj(raw["books"])) {
    const rb = raw["books"], vb = isObj(base["books"]) ? base["books"] : {};
    for (const k of Object.keys(rb)) if (Array.isArray(rb[k]) || (BOOK_MAPS as readonly string[]).includes(k)) scan(`books.${k}`, rb[k], vb[k]);
    if ("goldRate" in rb && !("goldRate" in vb)) found.push({ path: "books.goldRate", index: "goldRate", record: rb["goldRate"] });
  }
  return found;
}
