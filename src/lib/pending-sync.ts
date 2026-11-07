import type { PendingEntry } from "./offline";

export type PendingStatus = "waiting" | "saving" | "saved" | "failed";
export interface PendingItem {
  id: string; date: string; payee: string; title: string; amount: number; currency: string;
  createdAt: string; status: PendingStatus; error?: string | undefined;
}

/** Combine the device queue with known statuses. Saved items stay listed (they're no longer queued); everything queued shows at least "waiting". */
export function mergePending(prev: PendingItem[], queued: PendingEntry[]): PendingItem[] {
  const byId = new Map(prev.map((p) => [p.id, p]));
  const queuedIds = new Set(queued.map((q) => q.id));
  const fromQueue = queued.map((q): PendingItem => {
    const old = byId.get(q.id);
    return {
      id: q.id, date: q.input.date, payee: q.input.merchant || q.input.title, title: q.input.title,
      amount: Number(q.input.amount), currency: q.input.currency, createdAt: q.createdAt,
      status: old && old.status !== "saved" ? old.status : "waiting", error: old?.status === "failed" ? old.error : undefined,
    };
  });
  const saved = prev.filter((p) => p.status === "saved" && !queuedIds.has(p.id));
  return [...fromQueue, ...saved].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function setItem(list: PendingItem[], id: string, patch: Partial<PendingItem>): PendingItem[] {
  return list.map((p) => (p.id === id ? { ...p, ...patch } : p));
}

/** True when the entry lives only on this device: it has never reached the account, so removing it here loses it for good. */
export function removalIsPermanent(item: Pick<PendingItem, "status">): boolean {
  return item.status !== "saved";
}

/** Removing a device-only entry needs the owner's acknowledgement first; one already saved to the account does not. */
export function canRemove(item: Pick<PendingItem, "status"> | undefined, acknowledged: boolean): boolean {
  if (!item) return false;
  return removalIsPermanent(item) ? acknowledged : true;
}
