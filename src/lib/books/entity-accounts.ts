/** Company ↔ account links (books.entityAccounts). Pure rules: a company may hold many accounts; an account belongs to at most one company. */
import type { EntityKind, EntityProfile } from "../entities";
import { fyOf } from "../entities";

export type EntityAccounts = Record<string, string[]>;

export function ownerOf(map: EntityAccounts, accountId: string): string | null {
  for (const [e, ids] of Object.entries(map)) if (ids.includes(accountId)) return e;
  return null;
}

/** Remove an account from every company. */
export function unlinkAccount(map: EntityAccounts, accountId: string): EntityAccounts {
  const out: EntityAccounts = {};
  for (const [e, ids] of Object.entries(map)) { const left = ids.filter((x) => x !== accountId); if (left.length) out[e] = left; }
  return out;
}

/** Link accounts to a company, moving each away from any previous company. entityId null = personal (unlink). */
export function linkAccounts(map: EntityAccounts, entityId: string | null, accountIds: string[]): EntityAccounts {
  let out = map;
  for (const id of accountIds) out = unlinkAccount(out, id);
  if (!entityId || !accountIds.length) return out;
  return { ...out, [entityId]: [...new Set([...(out[entityId] ?? []), ...accountIds])] };
}

/** Delete a company's links (accounts stay, entries untouched). */
export function dropEntity(map: EntityAccounts, entityId: string): EntityAccounts {
  const { [entityId]: _gone, ...rest } = map;
  return rest;
}

/** Merge one company's accounts into another. */
export function mergeEntity(map: EntityAccounts, fromId: string, intoId: string): EntityAccounts {
  if (fromId === intoId) return map;
  return linkAccounts(dropEntity(map, fromId), intoId, map[fromId] ?? []);
}

/** Minimal company profile; every detail can be filled in later. */
export function stubEntity(name: string, kind: EntityKind = "company", today = new Date().toISOString().slice(0, 10)): EntityProfile {
  return { id: crypto.randomUUID(), name: name.trim() || "Unnamed company", kind, pan: "", gstins: [], booksFrom: fyOf(today) };
}

const BIZ = /\b(pvt|private|ltd|limited|llp|inc|corp(oration)?|co\.?|company|enterprises?|traders?|trading|industries|solutions|services|associates|agencies|exports?|imports?|ventures|holdings|technologies|tech|infra|foods|textiles|motors|logistics|firm|partners|&\s*co|huf)\b/i;
export function looksLikeBusiness(holder: string | null | undefined): boolean {
  return !!holder && BIZ.test(holder);
}

const norm = (s: string) => s.toUpperCase().replace(/\b(M\/S|MS|THE)\b/g, "").replace(/\bPRIVATE\b/g, "PVT").replace(/\bLIMITED\b/g, "LTD").replace(/[^A-Z0-9]/g, "");
export function matchEntityByName(list: EntityProfile[], name: string | null | undefined): EntityProfile | null {
  if (!name?.trim()) return null;
  const n = norm(name);
  return list.find((e) => e.name.trim() && norm(e.name) === n) ?? null;
}

/** True while a profile still needs details the owner said they'd fill later. */
export function needsDetails(e: EntityProfile): boolean {
  return !e.pan.trim();
}

/** Company an entry counts for: a hand-picked company wins; otherwise the paying account's company; null = personal. */
export function effectiveEntity(e: { entityId?: string | null; entitySource?: "account" | "manual"; accountId?: string | null }, map: EntityAccounts): string | null {
  if (e.entitySource === "manual") return e.entityId ?? null;
  return e.accountId ? ownerOf(map, e.accountId) : null;
}

/** Entries that would change company if this account moved (manual choices are kept). */
export function affectedByMove(entries: { accountId?: string | null; entitySource?: "account" | "manual" }[], accountId: string): number {
  return entries.filter((e) => e.accountId === accountId && e.entitySource !== "manual").length;
}

/** Documents that could belong to a company: already tagged to it, or linked to one of its accounts. Suggestion only — tagging is an explicit owner action, and UI filters are never authorisation. */
export function companyDocuments<D extends { id: string; accountId: string | null; entityId?: string | null }>(docs: D[], map: EntityAccounts, entityId: string): { tagged: D[]; suggested: D[] } {
  const tagged = docs.filter((d) => d.entityId === entityId);
  const suggested = docs.filter((d) => !d.entityId && !!d.accountId && ownerOf(map, d.accountId) === entityId);
  return { tagged, suggested };
}
