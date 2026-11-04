import { describe, expect, it } from "vitest";
import { indexedDB } from "fake-indexeddb";
import { localDrafts, putLocalDraft, type LocalDraft } from "./offline";
import { removeFailedOfflineScans, removeOfflineScan } from "./offline-scan";

globalThis.indexedDB = indexedDB;

const photo = (id: string, extra: Record<string, unknown> = {}): LocalDraft => ({
  id,
  data: { pendingScan: true, title: "Receipt photo (taken offline)", ...extra },
  files: [{ name: `${id}.jpg`, type: "image/jpeg", bytes: [1, 2, 3] }],
  updatedAt: "2026-11-04T09:00:00.000Z",
});

describe("Removing offline receipt photos", () => {
  it("deletes a failed photo from this phone and leaves the others untouched", async () => {
    const owner = "remove-owner";
    await putLocalDraft(owner, photo("failed-1", { error: "Couldn't connect", errorKind: "upload", attempts: 2 }));
    await putLocalDraft(owner, photo("waiting-1"));
    await putLocalDraft(owner, { ...photo("read-1"), data: { pendingScan: false, extracted: true, merchant: "Cream Centre" } });

    expect(await removeOfflineScan(owner, "failed-1")).toBe(true);

    const left = await localDrafts(owner);
    expect(left.map((d) => d.id).sort()).toEqual(["read-1", "waiting-1"]);
  });

  it("refuses to remove a photo that has already been read into a draft, or one that isn't there", async () => {
    const owner = "keep-owner";
    await putLocalDraft(owner, { ...photo("read-2"), data: { pendingScan: false, extracted: true, merchant: "Cream Centre" } });

    expect(await removeOfflineScan(owner, "read-2")).toBe(false);
    expect(await removeOfflineScan(owner, "no-such-photo")).toBe(false);
    expect((await localDrafts(owner)).map((d) => d.id)).toEqual(["read-2"]);
  });

  it("clears every failed photo in one go without dropping photos still waiting to be read", async () => {
    const owner = "clear-owner";
    await putLocalDraft(owner, photo("failed-a", { error: "Reading problem", errorKind: "reading", attempts: 1 }));
    await putLocalDraft(owner, photo("failed-b", { error: "Couldn't connect", errorKind: "upload", attempts: 3 }));
    await putLocalDraft(owner, photo("waiting-b"));
    await putLocalDraft(owner, { ...photo("read-b"), data: { pendingScan: false, extracted: true } });

    expect(await removeFailedOfflineScans(owner)).toBe(2);

    const left = await localDrafts(owner);
    expect(left.map((d) => d.id).sort()).toEqual(["read-b", "waiting-b"]);
    expect(await removeFailedOfflineScans(owner)).toBe(0);
  });

  it("keeps another owner's photos when one owner removes their own", async () => {
    await putLocalDraft("drop-owner", photo("shared-id", { error: "Couldn't connect", errorKind: "upload" }));
    await putLocalDraft("hold-owner", photo("shared-id", { error: "Couldn't connect", errorKind: "upload" }));

    expect(await removeOfflineScan("drop-owner", "shared-id")).toBe(true);

    expect(await localDrafts("drop-owner")).toEqual([]);
    expect((await localDrafts("hold-owner")).map((d) => d.id)).toEqual(["shared-id"]);
  });
});
