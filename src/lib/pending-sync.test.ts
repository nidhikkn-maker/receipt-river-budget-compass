import { describe, expect, it } from "vitest";
import { mergePending, setItem } from "./pending-sync";
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
