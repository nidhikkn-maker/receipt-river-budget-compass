import { CURRENCIES, PAYMENT_METHODS, type PaymentMethod, type Scope } from "./expenses";

export interface QuickEntrySearch { edit?: string; text?: string; title?: string; merchant?: string; amount?: number; currency?: string; date?: string; payment?: PaymentMethod; account?: string; scope?: Scope; trip?: string; booking?: string; kind?: "advance" | "advance_settlement"; draft?: string; retry?: boolean }
/** Shortcut URLs prefill only; they never save or trigger AI without confirmation. */
export function quickEntrySearch(raw: Record<string, unknown>): QuickEntrySearch {
  const out: QuickEntrySearch = {};
  for (const key of ["edit", "title", "merchant", "account"] as const) {
    if (typeof raw[key] === "string" && raw[key].trim()) out[key] = raw[key].trim().slice(0, key === "title" ? 160 : 80);
  }
  const text = [raw["text"], raw["url"]].filter(v => typeof v === "string").join(" ").trim();
  if (text) out.text = text.slice(0, 500);
  const amount = Number(raw["amount"]);
  if (Number.isFinite(amount) && amount > 0 && amount <= 100000000) out.amount = amount;
  const currency = typeof raw["currency"] === "string" ? raw["currency"].toUpperCase() : "";
  if ((CURRENCIES as readonly string[]).includes(currency)) out.currency = currency;
  const date = raw["date"];
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0,10) === date) out.date = date;
  if ((PAYMENT_METHODS as readonly unknown[]).includes(raw["payment"])) out.payment = raw["payment"] as PaymentMethod;
  if (["personal", "family", "business", "official"].includes(raw["scope"] as string)) out.scope = raw["scope"] as Scope;
  if (typeof raw["trip"] === "string" && /^[A-Za-z0-9-]{1,64}$/.test(raw["trip"])) out.trip = raw["trip"];
  if (typeof raw["booking"] === "string" && /^[A-Za-z0-9-]{1,64}$/.test(raw["booking"])) out.booking = raw["booking"];
  if (typeof raw["draft"] === "string" && /^[0-9a-f-]{36}$/i.test(raw["draft"])) out.draft = raw["draft"];
  if (raw["retry"] === true || raw["retry"] === "1" || raw["retry"] === 1) out.retry = true;
  if (raw["kind"] === "advance" || raw["kind"] === "advance_settlement") out.kind = raw["kind"];
  return out;
}