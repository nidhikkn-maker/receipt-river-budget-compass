// Saved payment methods (UPI IDs, cards, wallets, cash…). Pure, tested rules.
// Each method is linked to the account its money actually moves through, so picking it
// fills the entry's general payment type and account and balances stay correct.
import type { Account, AccountKind } from "./ledger";
import type { PaymentMethod } from "./expenses";

export const INSTRUMENT_TYPES = ["upi", "upi_lite", "debit_card", "credit_card", "rupay_upi", "cash", "wallet", "net_banking", "cheque", "forex_card", "company_card"] as const;
export type InstrumentType = (typeof INSTRUMENT_TYPES)[number];
export const INSTRUMENT_LABEL: Record<InstrumentType, string> = {
  upi: "UPI ID", upi_lite: "UPI Lite", debit_card: "Debit card", credit_card: "Credit card", rupay_upi: "RuPay credit card on UPI",
  cash: "Cash", wallet: "Wallet (Paytm, Amazon Pay…)", net_banking: "Net banking", cheque: "Cheque", forex_card: "Forex card", company_card: "Company card",
};
/** General payment type recorded on the entry for each method. */
export const INSTRUMENT_PAYMENT: Record<InstrumentType, PaymentMethod> = {
  upi: "upi", upi_lite: "upi", debit_card: "debit_card", credit_card: "credit_card", rupay_upi: "credit_card", cash: "cash", wallet: "other",
  net_banking: "bank_transfer", cheque: "bank_transfer", forex_card: "forex_card", company_card: "company_card",
};
/** Account kinds each method may be linked to. */
const BANK: AccountKind[] = ["savings", "current"];
export const INSTRUMENT_ACCOUNT_KINDS: Record<InstrumentType, AccountKind[]> = {
  upi: BANK, debit_card: BANK, net_banking: BANK, cheque: BANK,
  upi_lite: ["wallet", ...BANK], wallet: ["wallet"], cash: ["cash"],
  credit_card: ["credit_card"], rupay_upi: ["credit_card"],
  forex_card: ["wallet", ...BANK, "other_asset"], company_card: ["credit_card", ...BANK, "other_liability"],
};
const CARD_TYPES: InstrumentType[] = ["debit_card", "credit_card", "rupay_upi", "forex_card", "company_card"];
const UPI_TYPES: InstrumentType[] = ["upi", "rupay_upi"];
export const usesUpiHandle = (t: InstrumentType) => UPI_TYPES.includes(t);
export const usesLastFour = (t: InstrumentType) => CARD_TYPES.includes(t);

export interface PaymentInstrument {
  id: string;
  type: InstrumentType;
  nickname: string;
  /** UPI handle such as name@okhdfc. */
  handle?: string;
  /** Last 4 card digits only — full card numbers are never stored. */
  lastFour?: string;
  accountId: string;
  /** Family member who uses it; null = you. */
  memberId?: string | null;
  /** Add-on card: id of the main card method. */
  parentId?: string | null;
  isDefault?: boolean;
  archived?: boolean;
}

export const UPI_RE = /^[a-z0-9._-]{2,256}@[a-z][a-z0-9.-]{1,63}$/i;

/** Returns a cleaned method or throws with a user-readable reason. */
export function validateInstrument(x: PaymentInstrument, accounts: Account[], all: PaymentInstrument[] = []): PaymentInstrument {
  if (!(INSTRUMENT_TYPES as readonly string[]).includes(x.type)) throw new Error("Pick a payment type");
  const nickname = x.nickname.trim().slice(0, 60);
  if (!nickname) throw new Error("Give it a name, like “GPay HDFC”");
  const acc = accounts.find((a) => a.id === x.accountId && !a.archived);
  if (!acc) throw new Error("Link it to one of your accounts");
  if (!INSTRUMENT_ACCOUNT_KINDS[x.type].includes(acc.kind)) throw new Error(`${INSTRUMENT_LABEL[x.type]} must be linked to a ${INSTRUMENT_ACCOUNT_KINDS[x.type].map((k) => k.replace("_", " ")).join(" / ")} account`);
  const out: PaymentInstrument = { id: x.id, type: x.type, nickname, accountId: acc.id, memberId: x.memberId ?? null, parentId: null, isDefault: !!x.isDefault, archived: !!x.archived };
  if (usesUpiHandle(x.type)) {
    const h = (x.handle ?? "").trim().toLowerCase();
    if (!UPI_RE.test(h)) throw new Error("Enter a valid UPI ID, like name@okhdfc");
    out.handle = h;
  }
  if (usesLastFour(x.type)) {
    const digits = (x.lastFour ?? "").replace(/\D/g, "");
    if (digits.length !== 4) throw new Error("Enter only the last 4 digits of the card");
    out.lastFour = digits;
  }
  if (x.parentId) {
    const parent = all.find((p) => p.id === x.parentId);
    if (!parent || parent.id === x.id || !["credit_card", "debit_card"].includes(parent.type)) throw new Error("Add-on cards must belong to a main card");
    out.parentId = parent.id;
  }
  const others = all.filter((p) => p.id !== x.id && !p.archived);
  if (others.some((p) => p.nickname.trim().toLowerCase() === nickname.toLowerCase())) throw new Error(`A payment method called “${nickname}” already exists`);
  if (out.handle && others.some((p) => p.handle === out.handle)) throw new Error("This UPI ID is already saved");
  if (out.lastFour && others.some((p) => p.type === out.type && p.lastFour === out.lastFour && p.accountId === out.accountId)) throw new Error("This card is already saved for that account");
  return out;
}

/** Add or replace a method; keeps a single default. */
export function upsertInstrument(list: PaymentInstrument[], x: PaymentInstrument, accounts: Account[]): PaymentInstrument[] {
  const clean = validateInstrument(x, accounts, list);
  const next = list.some((p) => p.id === clean.id) ? list.map((p) => (p.id === clean.id ? clean : p)) : [...list, clean];
  return clean.isDefault ? next.map((p) => (p.id === clean.id ? p : { ...p, isDefault: false })) : next;
}

export function instrumentLabel(p: PaymentInstrument): string {
  const tail = p.handle ? ` · ${p.handle}` : p.lastFour ? ` ··${p.lastFour}` : "";
  return `${p.nickname}${tail}`;
}

/** What picking a method fills in on an entry. */
export function applyInstrument(p: PaymentInstrument): { paymentMethod: PaymentMethod; accountId: string; memberId: string | null } {
  return { paymentMethod: INSTRUMENT_PAYMENT[p.type], accountId: p.accountId, memberId: p.memberId ?? null };
}

export const activeInstruments = (list: PaymentInstrument[], accounts: Account[]) =>
  list.filter((p) => !p.archived && accounts.some((a) => a.id === p.accountId && !a.archived));

export const linkedTo = (list: PaymentInstrument[], accountId: string) => list.filter((p) => !p.archived && p.accountId === accountId);

/** Method last used at a shop (same normalised merchant name), if still active. */
export function lastInstrumentForMerchant(merchant: string, entries: { merchant: string | null; date: string; paymentInstrumentId?: string | null }[], active: PaymentInstrument[]): PaymentInstrument | null {
  const key = merchant.trim().toLowerCase();
  if (!key) return null;
  const hit = entries.filter((e) => e.paymentInstrumentId && (e.merchant ?? "").trim().toLowerCase() === key).sort((a, b) => b.date.localeCompare(a.date))[0];
  return hit ? active.find((p) => p.id === hit.paymentInstrumentId) ?? null : null;
}

/** Spending total per method (expense entries only), in INR. */
export function totalsByInstrument(entries: { amount: number; txnType?: string; paymentInstrumentId?: string | null }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of entries) {
    if ((e.txnType ?? "expense") !== "expense" || !e.paymentInstrumentId) continue;
    out[e.paymentInstrumentId] = Math.round(((out[e.paymentInstrumentId] ?? 0) + e.amount) * 100) / 100;
  }
  return out;
}
