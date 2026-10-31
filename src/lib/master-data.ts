// Shared master-record rules (Version 4.9): one place decides what counts as a duplicate.
import type { Account, AccountKind } from "./ledger";

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Returns the existing active account a new/renamed one would duplicate, if any. */
export function duplicateAccount(accounts: Account[], x: { id?: string; name: string; kind: AccountKind; lastFour?: string | null }): Account | null {
  const live = accounts.filter((a) => !a.archived && a.id !== x.id);
  return live.find((a) => norm(a.name) === norm(x.name))
    ?? (x.lastFour ? live.find((a) => a.kind === x.kind && a.lastFour === x.lastFour) ?? null : null);
}

/** Organisation directory entries are the "Organisation" tag group, with usage counts across entries. */
export function organisationUsage(tags: { group: string; name: string }[], entries: { tags?: string[] | null }[]) {
  return tags.filter((t) => t.group === "Organisation").map((t) => {
    const v = `Organisation: ${t.name}`;
    return { name: t.name, uses: entries.filter((e) => (e.tags ?? []).includes(v)).length };
  }).sort((a, b) => a.name.localeCompare(b.name));
}
