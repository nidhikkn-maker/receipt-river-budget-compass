// Automatic registration of bank-statement lines as ledger entries (pure, tested).
// A line is only auto-registered when the rules are confident; anything that needs a
// person's decision (transfers, cash withdrawals, unclear credits) is returned for review.

import { matchScore, type Expense, type ExpenseInput, type PaymentMethod, type Scope, type StatementLine, type Match } from "./expenses";
import { suggestForMerchant, type Account, type AccountKind, type TxnType } from "./ledger";
import { resolveCategory, type CategorySetting } from "./preferences";

export interface StatementDraft {
  line: StatementLine;
  title: string;
  merchant: string;
  category: string;
  paymentMethod: PaymentMethod;
  scope: Scope;
  txnType: TxnType;
  accountId: string | null;
  /** Plain-words reason this line was read this way. */
  reason: string;
}

export interface StatementPlan {
  /** Safe to save without asking. */
  register: StatementDraft[];
  /** Needs a person's choice (usually which account it went to). */
  review: StatementDraft[];
  /** Left alone because it is already recorded or matched. */
  skipped: { line: StatementLine; reason: string }[];
}

export interface StatementContext {
  transactions: Expense[];
  accounts: Account[];
  categories: CategorySetting[];
  /** Account the statement came from, when the user picked one. */
  accountId: string | null;
  currency: string;
}

/** Keyword -> category. Checked in order, first hit wins. Names must exist in the catalog. */
const CATEGORY_RULES: [RegExp, string][] = [
  [/\b(PETROL|DIESEL|FUEL|HPCL|BPCL|IOC|INDICAN|SHELL|CASTROL|FASTAG|FAST TAG|TOLL|PARIVAHAN)\b/, "Fuel and vehicle expenses"],
  [/\b(SWIGGY|ZOMATO|DOMINO|MCDONALD|KFC|BURGER|PIZZA|RESTAURANT|CAFE|COFFEE|BAKERY|BIRYANI|TIFFIN|EATS|BERMICO|SHUTTLER|RAAGA|DINE|BUFFET|ICE ?CREAM|FOOD)\b/, "Food and beverages"],
  [/\b(BIGBASKET|BLINKIT|ZEPTO|JIO ?MART|DMART|RELIANCE FRESH|LOCALCIRCLE|SUPERMARKET|GROCERY|GROCERS|SPENCERS|METRO|NILGIRIS|LILAVATI|FRESH|KIRANA)\b/, "Groceries"],
  [/\b(AMAZON|FLIPKART|MYNTRA|AJIO|NYKAA|CROMA|MEESHO|ALIEXPRESS|EBAY|SHOPS?|STORE)\b/, "Shopping"],
  [/\b(ELECTRICITY|ELECTRIC|POWER|TNEB|BESCOM|MSEB|BESCOM|GAS|LPG|PIPED|WATER|BROADBAND|AIRTEL|VODAFONE|IDEA|BSNL|JIO|POSTPAID|RECHARGE|UTILITY|UTILITIES)\b/, "Utility bills"],
  [/\b(NETFLIX|SPOTIFY|PRIME|YOUTUBE|APPLE ?\.COM|GOOGLE ?ONE|HOTSTAR|SONYLIV|JIOHOTSTAR|SUBSCRIPTION|MEMBERSHIP|CHAIPPT|TATASCAP|SONIC)\b/, "Digital subscriptions"],
  [/\b(UBER|OLA|IRCTC|RAIL|INDIGO|AIRASIA|FLIGHT|AIR ?INDIA|MAKEMYTRIP|MAKE MY TRIP|REDBUS|ABHIBUS|AKULE|PARKING|HOTEL|TRAVEL|ACCOMMODATION|VISA)\b/, "Travel and accommodation"],
  [/\b(PHARMACY|PHARMA|MEDICINE|MEDICARE|HOSPITAL|CLINIC|DIAGNOSTIC|LAB|APOLLO|1MG|PRACTO|HEALTHCARE|DENTAL|SCAN|THERAPY)\b/, "Medical and healthcare"],
  [/\b(SCHOOL|COLLEGE|UNIVERSITY|TUITION|COACHING|ACADEMY|COURSE|UDEMY|EDUCATION|EXAM|FEES)\b/, "Education"],
  [/\b(LIC|INSURANCE|POLICY|PREMIUM|HDFC ?LIFE|ICICI ?LIFE|TATTA|HEALTH ?INSURANCE)\b/, "Insurance"],
  [/\b(PVR|INOX|CINEPOLIS|BOOKMYSHOW|MOVIE|CINEMA|STEAM|CONCERT|GAMES|NETFLIX ?AND ?CHILL)\b/, "Entertainment"],
  [/\b(SALON|SALON|GROOMING|COSMETIC|GYM|FITNESS|SPA|BARBER|HAIRCUT)\b/, "Personal care"],
  [/\b(MAID|DOMESTIC|COOK|NANNY|HOUSE ?KEEP|STAFF)\b/, "Domestic staff"],
  [/\b(RENT|RENTAL|LANDLORD|MAINTENANCE|FURNITURE|IKEA|ELECTRONIC|APPLIANCE|CLEANING|HARDWARE|PAINT)\b/, "Household expenses"],
  [/\b(GIFT|FLOWER|DONATION|CHARITY|PUJA|DIWALI|CRACKER)\b/, "Gifts and occasions"],
  [/\b(KIDS?|CHILD|TOY|DIAPER|BABY|CRèche|CRECHE|DAYCARE)\b/, "Family and children"],
  [/\b(CHARGE|CHARGES|PENALTY|SURCHARGE|FINE|AMCC|MINIMUM BALANCE|MARKUP|FOREX FEE|ATM FEE|GST)\b/, "Financial charges"],
  [/\b(OFFICE|STATIONERY|PAPERMARK|CANVA|ADOBE|ZOOM|SLACK|DOMAIN|HOSTING)\b/, "Office & Supplies"],
];

/** Keyword -> payment method. */
const METHOD_RULES: [RegExp, PaymentMethod][] = [
  [/\b(UPI|VPA|PAYTM|PHONEPE|PHONE ?PE|GPAY|G ?PAY|BHIM|TEZ|GOOGLE ?PAY|APPLE ?PAY|CRED|FUPO|TEZ)\b/, "upi"],
  [/\b(CASH|ATM|WDL|WDL|CWD|WDL|CASHWDL)\b/, "cash"],
  [/\b(NEFT|IMPS|RTGS|CHQ|CHEQUE|DD|DRAFT|TRANSFER|FUND ?TRANSFER)\b/, "bank_transfer"],
  [/\b(CARD|POS|VISA|MASTERCARD|RUPAY|AMEX|EHC|SWIPE|CHIP|ECOM)\b/, "card"],
];

const TRANSFER_DEBIT = /\b(TRANSFER|UTDR|UDR|SELF ?A ?C|A ?C ?TRANSFER|FUND ?TRANSFER|NEFT|IMPS|RTGS|CHQ ?WDL|WDL|WDL|CASH ?WDL|ATM)\b/;
const CARD_OR_LOAN_PAYMENT = /\b(CREDIT ?CARD|CARD)\b.{0,18}\b(PAYMENT|BILL|DUE|OUTSTANDING)\b|\b(BILL|CARD|CREDIT ?CARD)\b.{0,12}\bPAYMENT\b|\bLOAN\b.{0,14}\b(EMI|REPAYMENT|PAYMENT|INSTALLMENT|DUE)\b|\bEMI\b|\bSIP\b|\bMUTUAL ?FUND\b|\bDEMAt\b|\bDEMAT\b|\bFD\b|\bINVESTMENT\b|\bSHARES?\b|\bGOLD ?BEES\b/;
const REFUND_CREDIT = /\b(REFUND|REVERSAL|REVERSED|CASH ?BACK|CASHBACK|RETURN|CHARGEBACK|DR\.? ?REVERSAL)\b/;
const INCOME_CREDIT = /\b(SALARY|STIPEND|PAYROLL|INTEREST|DIVIDEND|BONUS|REWARD|CREDIT ?INTEREST|PAYOUT|RENT ?IN)\b/;
const TRANSFER_CREDIT = /\b(TRANSFER|UTCR|UDR|NEFT|IMPS|RTGS|FUND ?TRANSFER|SELF ?A ?C)\b/;

const norm = (s: string) => s.toUpperCase();

/** Turn a bank narration into a readable merchant name. */
export function cleanMerchant(description: string): string {
  const raw = (description || "")
    .replace(/\b\d{5,}\b/g, " ")
    .replace(/\b\d{2}[./-]\d{2}[./-]\d{2,4}\b/g, " ")
    .replace(/\b(UTR|NARN|REF|TXN|CRR|CHQ|DR|CR)\b/gi, " ")
    .replace(/[^\w\s&./-]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  const words = raw.split(/\s+/).filter((w) => !/^\d+$/.test(w) && w.length > 1).slice(0, 4);
  const out = words.join(" ").trim();
  if (!out) return (description || "").trim().slice(0, 40) || "Statement entry";
  return out.charAt(0).toUpperCase() + out.slice(1);
}

function paymentMethodFor(description: string, accountKind: AccountKind | undefined): PaymentMethod {
  const up = norm(description);
  for (const [re, method] of METHOD_RULES) {
    if (!re.test(up)) continue;
    if (method === "card") return accountKind === "credit_card" ? "credit_card" : "debit_card";
    return method;
  }
  return "other";
}

function categoryFor(description: string, categories: CategorySetting[], fallback: string): string {
  const up = norm(description);
  for (const [re, name] of CATEGORY_RULES) {
    if (!re.test(up)) continue;
    const resolved = resolveCategory(categories, name);
    if (resolved) return resolved;
  }
  return resolveCategory(categories, fallback) ?? resolveCategory(categories, "Miscellaneous") ?? categories.find((c) => !c.archived)?.name ?? "Miscellaneous";
}

/** Read one statement line into a draft entry, or say why a person must decide. */
export function classifyStatementLine(line: StatementLine, ctx: StatementContext): StatementDraft {
  const up = norm(line.description || "");
  const merchant = cleanMerchant(line.description || "");
  const account = ctx.accounts.find((a) => a.id === ctx.accountId);
  const memory = suggestForMerchant(merchant, ctx.transactions as never);
  const base = {
    line,
    title: merchant,
    merchant,
    accountId: ctx.accountId,
    paymentMethod: (memory?.paymentMethod as PaymentMethod) || paymentMethodFor(up, account?.kind),
    scope: (memory?.scope === "business" ? "business" : "personal") as Scope,
  };
  const category = memory?.category && resolveCategory(ctx.categories, memory.category)
    ? resolveCategory(ctx.categories, memory.category)!
    : categoryFor(up, ctx.categories, "Miscellaneous");

  if (line.direction === "credit") {
    if (REFUND_CREDIT.test(up)) return { ...base, category, txnType: "refund", reason: "Refund or reversal credited back" };
    if (INCOME_CREDIT.test(up)) return { ...base, category, txnType: "income", reason: "Money coming in (salary, interest or dividend)" };
    if (TRANSFER_CREDIT.test(up)) return { ...base, category, txnType: "transfer", reason: "Money moved in from another account — pick where it came from" };
    return { ...base, category, txnType: "income", reason: "Credit line — confirm it is income before saving" };
  }

  if (CARD_OR_LOAN_PAYMENT.test(up)) return { ...base, category, txnType: "transfer", reason: "Card, loan or investment payment — pick the account it went to" };
  if (TRANSFER_DEBIT.test(up)) return { ...base, category, txnType: "transfer", reason: "Transfer or cash withdrawal — pick where the money went" };
  if (/\b(CHARGES?|PENALTY|SURCHARGE|MINIMUM BALANCE|AMCC|MARKUP|FOREX FEE|LATE FEE)\b/.test(up)) {
    return { ...base, category: resolveCategory(ctx.categories, "Financial charges") ?? category, txnType: "expense", reason: "Bank or card charge" };
  }
  return { ...base, category, txnType: "expense", reason: "Regular purchase" };
}

/** Split statement lines into auto-register, needs-review and already-recorded. */
export function planStatementRegistration(lines: StatementLine[], matches: Match[], ctx: StatementContext): StatementPlan {
  const plan: StatementPlan = { register: [], review: [], skipped: [] };
  for (const line of lines) {
    const match = matches.find((m) => m.line.ref === line.ref);
    if (match?.expense) {
      plan.skipped.push({ line, reason: `Already matched to “${match.expense.title}”` });
      continue;
    }
    if (ctx.transactions.some((t) => matchScore(line, t, ctx.currency) >= 0.7)) {
      plan.skipped.push({ line, reason: "Already in your ledger" });
      continue;
    }
    const draft = classifyStatementLine(line, ctx);
    if (draft.txnType === "transfer" || /confirm it is income/.test(draft.reason)) plan.review.push(draft);
    else plan.register.push(draft);
  }
  return plan;
}

/** The saved-entry shape for a draft. */
export function draftToInput(draft: StatementDraft): ExpenseInput {
  return {
    title: draft.title,
    merchant: draft.merchant,
    category: draft.category,
    scope: draft.scope,
    memberId: null,
    amount: draft.line.amount,
    currency: ctx_currency(draft.line),
    paymentMethod: draft.paymentMethod,
    date: draft.line.date,
    description: "Statement import",
    txnType: draft.txnType,
    accountId: draft.accountId,
    toAccountId: null,
    tags: [],
  };
}

// The line itself carries no currency; the statement's currency is attached at plan time.
let currentCurrency = "INR";
export function setDraftCurrency(currency: string) { currentCurrency = currency; }
function ctx_currency(_line: StatementLine) { return currentCurrency; }
