import { describe, expect, it } from "vitest";
import { canRemove, mergePending, removalIsPermanent, setItem } from "./pending-sync";
import type { PendingStatus } from "./pending-sync";
import type { PendingEntry } from "./offline";

const entry = (id: string, createdAt: string): PendingEntry => ({
  id, owner: "o", files: [], createdAt,
  input: { title: "Lunch", merchant: "Cafe", amount: 250, currency: "INR", date: "2026-11-01" } as PendingEntry["input"],
});

describe("waiting to sync list", () => {
  it("lists queued entries as waiting with date, payee and amount", () => {
    const [i] = mergePending([], [entry("a", "2026-11-01T10:00:00Z")]);
    expect(i).toMatchObject({ status: "waiting", date: "2026-11-01", payee: "Cafe", amount: 250, currency: "INR" });
  });
  it("keeps the failure reason while the entry is still queued", () => {
    const list = setItem(mergePending([], [entry("a", "x")]), "a", { status: "failed", error: "Network" });
    expect(mergePending(list, [entry("a", "x")])[0]).toMatchObject({ status: "failed", error: "Network" });
  });
  it("keeps saved entries listed as saved once they leave the queue", () => {
    const list = setItem(mergePending([], [entry("a", "x")]), "a", { status: "saved" });
    expect(mergePending(list, [])).toEqual([expect.objectContaining({ id: "a", status: "saved" })]);
  });
});

describe("removing an entry from this device", () => {
  const item = (status: PendingStatus) => ({ id: "a", date: "2026-11-01", payee: "Cafe", title: "Lunch", amount: 250, currency: "INR", createdAt: "x", status });
  it("treats an entry that never reached the account as permanent loss", () => {
    for (const status of ["waiting", "saving", "failed"] as PendingStatus[]) expect(removalIsPermanent(item(status))).toBe(true);
  });
  it("treats an entry already saved to the account as recoverable", () => {
    expect(removalIsPermanent(item("saved"))).toBe(false);
  });
  it("blocks removal until the warning is acknowledged", () => {
    expect(canRemove(item("failed"), false)).toBe(false);
    expect(canRemove(item("failed"), true)).toBe(true);
    expect(canRemove(item("saved"), false)).toBe(true);
    expect(canRemove(undefined, true)).toBe(false);
  });
});
