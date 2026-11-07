/** Exact owner-visible label resolution; scanning alone never records a physical check. */
import type { Asset } from "../assets";
import type { AssetEvent } from "./types";

export type AssetLabelMatch = { ok: true; asset: Asset } | { ok: false; reason: string };

export function matchAssetLabel(raw: string, assets: Asset[]): AssetLabelMatch {
  const code = raw.trim().replace(/^LEDGERLINE-ASSET:/, "").trim();
  if (!code || code.length > 200) return { ok: false, reason: "Enter or scan a valid asset label" };
  const matches = assets.filter((a) => a.id === code || a.tag?.trim() === code);
  if (!matches.length) return { ok: false, reason: "No asset matches this label in your register" };
  if (matches.length !== 1) return { ok: false, reason: "This label matches more than one asset — correct the duplicate tags first" };
  const asset = matches[0];
  if (!asset) return { ok: false, reason: "No asset matches this label in your register" };
  if (asset.soldOn) return { ok: false, reason: "This asset has been disposed of and cannot be physically verified" };
  return { ok: true, asset };
}

export function physicalCheck(asset: Asset, date: string, condition: "ok" | "damaged" | "missing", note: string, id: string): { asset: Asset; event: AssetEvent } {
  if (asset.soldOn) throw new Error("Disposed assets cannot be physically verified");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error("Invalid check date");
  return {
    asset: { ...asset, lastVerified: date, condition },
    event: { id, assetId: asset.id, date, kind: condition === "ok" ? "verified" : condition, note: note.trim(), applied: true },
  };
}