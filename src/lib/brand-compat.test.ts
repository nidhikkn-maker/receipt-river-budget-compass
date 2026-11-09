// The Ledgerline → Thapal rename changed display text only. These internal identifiers must keep
// their original values so data already on devices, in backups and on printed labels keeps working.
// See docs/brand-usage.md ("Rename compatibility"). Do not "fix" these to thapal without a migration.
import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { putSnapshot, getSnapshot } from "./offline";
import { createBackupZip, readBackup, type Backup } from "./backup";
import { THEME_STYLES } from "./themes";
import { SMART_ADD_EVENT } from "./smart-add-event";
import { matchAssetLabel } from "./books/asset-verification";

describe("rename compatibility (Ledgerline → Thapal)", () => {
  it("offline data stays in the original encrypted IndexedDB database", async () => {
    const idb = new IDBFactory();
    globalThis.indexedDB = idb;
    await putSnapshot("owner-1", { balance: 123.45 });
    expect((await idb.databases()).map((d) => d.name)).toEqual(["ledgerline-offline"]);
    expect(await getSnapshot<{ balance: number }>("owner-1")).toEqual({ balance: 123.45 });
  });

  it("backups made before the rename (app id \"ledgerline\") still restore", () => {
    const backup: Backup = { app: "ledgerline", version: 2, owner: "a", exportedAt: "2026-10-31", data: { accounts: [] } } as Backup;
    expect(readBackup(createBackupZip(backup, {}), true).backup.app).toBe("ledgerline");
    expect(() => readBackup(createBackupZip({ ...backup, app: "other" } as unknown as Backup, {}), true)).toThrow("That isn't a Thapal backup");
  });

  it("saved theme choice, app events and printed asset labels keep their ids", () => {
    expect(THEME_STYLES.map((t) => t.name)).toContain("apple-ledgerline");
    expect(THEME_STYLES.find((t) => t.name === "apple-ledgerline")?.label).toBe("Apple × Thapal");
    expect(SMART_ADD_EVENT).toBe("ledgerline:smart-add");
    const asset = { id: "asset-1", tag: "LAPTOP-001" } as Parameters<typeof matchAssetLabel>[1][number];
    expect(matchAssetLabel("LEDGERLINE-ASSET:LAPTOP-001", [asset])).toEqual({ ok: true, asset });
  });
});
