/** Manual market-price overrides used while a licensed price feed is pending [v6.1 §5].
 * Each override keeps its source, price date and a full append-only change history. An active
 * override wins over any feed or closing price for that security until you clear it. */
import type { Quote } from "./types";

export type OverrideAction = "set" | "changed" | "cleared";
export interface OverrideChange { at: string; action: OverrideAction; price: number; priceDate: string; source: string; note?: string | undefined }
export interface PriceOverride {
  key: string; name: string; price: number; priceDate: string; source: string; note?: string | undefined;
  active: boolean; history: OverrideChange[];
}
export interface OverrideInput { key: string; name: string; price: number; priceDate: string; source: string; note?: string | undefined }

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/** Returns an error message, or null when the input is acceptable. */
export function validateOverride(i: OverrideInput, today: string): string | null {
  if (!i.key) return "This holding has no ISIN, symbol or scheme code to attach a price to";
  if (!(Number.isFinite(i.price) && i.price > 0)) return "Enter a price above zero";
  if (!isDate(i.priceDate)) return "Enter the date the price applies to";
  if (i.priceDate > today) return "The price date cannot be in the future";
  if (!i.source.trim()) return "Say where this price came from";
  return null;
}

export function setOverride(list: PriceOverride[], i: OverrideInput, now: string): PriceOverride[] {
  const err = validateOverride(i, now.slice(0, 10));
  if (err) throw new Error(err);
  const prev = list.find((o) => o.key === i.key);
  const change: OverrideChange = { at: now, action: prev?.active ? "changed" : "set", price: i.price, priceDate: i.priceDate, source: i.source.trim(), note: i.note?.trim() || undefined };
  const next: PriceOverride = { key: i.key, name: i.name, price: i.price, priceDate: i.priceDate, source: change.source, note: change.note, active: true, history: [...(prev?.history ?? []), change] };
  return [...list.filter((o) => o.key !== i.key), next];
}

export function clearOverride(list: PriceOverride[], key: string, now: string): PriceOverride[] {
  return list.map((o) => (o.key === key && o.active ? { ...o, active: false, history: [...o.history, { at: now, action: "cleared" as const, price: o.price, priceDate: o.priceDate, source: o.source }] } : o));
}

export const overrideQuote = (o: PriceOverride): Quote => ({ key: o.key, price: o.price, at: o.priceDate, provider: `manual override · ${o.source}`, freshness: "manual", refreshedAt: o.history.at(-1)?.at ?? "" });

/** Active overrides replace any other quote for the same security. */
export function applyOverrides(quotes: Quote[], list: PriceOverride[]): Quote[] {
  const active = list.filter((o) => o.active);
  if (!active.length) return quotes;
  const keys = new Set(active.map((o) => o.key));
  return [...quotes.filter((q) => !keys.has(q.key)), ...active.map(overrideQuote)];
}

export const activeOverride = (list: PriceOverride[] | undefined, key: string | null) => (key ? (list ?? []).find((o) => o.key === key && o.active) : undefined);

export function cleanOverrides(raw: unknown): PriceOverride[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((o): o is PriceOverride => !!o && typeof o.key === "string" && typeof o.price === "number" && o.price > 0 && typeof o.priceDate === "string" && typeof o.source === "string" && typeof o.active === "boolean" && Array.isArray(o.history)).slice(0, 2000);
}
