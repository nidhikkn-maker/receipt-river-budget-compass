import { CATEGORIES, memberShares, type Expense } from "./expenses";

export interface CategorySetting { name: string; archived: boolean }
export interface GroupedTag { group: string; name: string }
export interface ScopedBudget { id: string; name: string; amount: number; period: "monthly" | "annual"; kind: "overall" | "category" | "person" | "project" | "travel"; value: string; start: string; carry: boolean }
export type Language = "en" | "hi" | "ta" | "te" | "kn" | "ml" | "mr" | "bn" | "gu";
export const LANGUAGES: Record<Language, string> = { en: "English", hi: "हिन्दी (Hindi)", ta: "தமிழ் (Tamil)", te: "తెలుగు (Telugu)", kn: "ಕನ್ನಡ (Kannada)", ml: "മലയാളം (Malayalam)", mr: "मराठी (Marathi)", bn: "বাংলা (Bengali)", gu: "ગુજરાતી (Gujarati)" };
export const HOME_SECTIONS = ["quick", "alerts", "briefing", "safe", "accounts", "budget", "summary", "family", "recent"] as const;
export const HOME_SECTION_LABEL: Record<(typeof HOME_SECTIONS)[number], string> = {
  quick: "Quick actions", alerts: "Alerts", briefing: "AI briefing", safe: "Safe to spend", accounts: "Cash, income & cards",
  budget: "Budget use", summary: "Business vs personal", family: "Family spending", recent: "Recent activity",
};

export interface FinancePreferences {
  categories: CategorySetting[];
  tags: GroupedTag[];
  budgets: ScopedBudget[];
  homeHidden: string[];
  homeOrder: string[];
  theme: "light" | "dark" | "system";
  reminders: boolean;
  /** Days before a due date to start reminding. */
  reminderDays: number;
  /** Currency pre-selected for new entries. */
  defaultCurrency: string;
  /** Language the AI assistant answers in. */
  language: Language;
  /** Master switch for every AI feature (receipt reading, voice entry, assistant, briefing). */
  aiEnabled: boolean;
  /** Allow receipt and document images to be sent for AI reading. */
  aiReadsDocuments: boolean;
  /** Card utilisation % that raises an alert. */
  cardAlertPct: number;
  /** Home overview period. */
  homePeriod: "day" | "week" | "month";
}

export const DEFAULT_TAGS: GroupedTag[] = [
  ...["Self", "Spouse", "Children", "Parents"].map((name) => ({ group: "Person", name })),
  ...["Personal", "Family", "Business-related", "Reimbursable"].map((name) => ({ group: "Purpose", name })),
  ...["VEI", "MOVAC", "AK Meridian", "KR Enterprises"].map((name) => ({ group: "Organisation", name })),
  ...["Essential", "Discretionary", "Recurring", "One-time"].map((name) => ({ group: "Nature", name })),
  ...["Travel", "Home", "Vehicle"].map((name) => ({ group: "Project", name })),
];

export function defaultPreferences(): FinancePreferences {
  return {
    categories: CATEGORIES.map((name) => ({ name, archived: false })), tags: DEFAULT_TAGS, budgets: [], homeHidden: [], homeOrder: [...HOME_SECTIONS],
    theme: "system", reminders: true, reminderDays: 3, defaultCurrency: "INR", language: "en", aiEnabled: true, aiReadsDocuments: true, cardAlertPct: 30, homePeriod: "month",
  };
}

/** Fill gaps in saved preferences: new settings get defaults and new Home sections join the end of the order. */
export function normalizePreferences(raw: Partial<FinancePreferences> | null | undefined): FinancePreferences {
  const d = defaultPreferences();
  const p = { ...d, ...(raw ?? {}) } as FinancePreferences;
  const order = (raw?.homeOrder ?? []).filter((x) => (HOME_SECTIONS as readonly string[]).includes(x));
  p.homeOrder = [...order, ...HOME_SECTIONS.filter((x) => !order.includes(x))];
  if (!Array.isArray(p.categories) || !p.categories.length) p.categories = d.categories;
  if (!Array.isArray(p.tags)) p.tags = d.tags;
  if (!Array.isArray(p.budgets)) p.budgets = [];
  if (!Array.isArray(p.homeHidden)) p.homeHidden = [];
  p.reminderDays = Number.isFinite(p.reminderDays) ? Math.min(30, Math.max(0, Math.round(p.reminderDays))) : d.reminderDays;
  p.cardAlertPct = Number.isFinite(p.cardAlertPct) ? Math.min(100, Math.max(5, Math.round(p.cardAlertPct))) : d.cardAlertPct;
  if (!/^[A-Z]{3}$/.test(p.defaultCurrency ?? "")) p.defaultCurrency = "INR";
  if (!(p.language in LANGUAGES)) p.language = "en";
  if (!["day", "week", "month"].includes(p.homePeriod)) p.homePeriod = "month";
  return p;
}

export const tagValue = (t: GroupedTag) => `${t.group}: ${t.name}`;
export const tagsInGroup = (tags: GroupedTag[], group: string) => tags.filter((t) => t.group === group).map(tagValue);
export function validateActiveCategory(categories: CategorySetting[], name: string, editing = false) {
  if (!editing && categories.some((c) => c.name === name && c.archived)) throw new Error("Choose an active category");
}
export function budgetSpend(e: Expense, b: ScopedBudget): number {
  if ((e.txnType ?? "expense") !== "expense") return 0;
  if (b.kind === "category") return e.category === b.value ? e.amount : 0;
  if (b.kind === "person") return memberShares(e).find((s) => (s.memberId ?? "me") === b.value)?.amount ?? 0;
  if (b.kind === "project" || b.kind === "travel") return (e.tags ?? []).includes(b.value) ? e.amount : 0;
  return e.amount;
}
/** Carry forward only unused allowance, never overspending. Annual periods reset in January. */
export function scopedBudgetUsage(b: ScopedBudget, entries: Expense[], today: string) {
  const start = b.period === "annual" ? `${today.slice(0, 4)}-01-01` : `${today.slice(0, 7)}-01`;
  const end = b.period === "annual" ? `${today.slice(0, 4)}-12-31` : new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const currentStart = start > b.start ? start : b.start;
  let carry = 0;
  if (b.carry && b.start < start) {
    let cursor = b.period === "annual" ? `${b.start.slice(0, 4)}-01-01` : `${b.start.slice(0, 7)}-01`;
    for (let n = 0; cursor < start && n < 1200; n++) {
      const next = b.period === "annual" ? `${Number(cursor.slice(0, 4)) + 1}-01-01` : new Date(Date.UTC(Number(cursor.slice(0, 4)), Number(cursor.slice(5, 7)), 1)).toISOString().slice(0, 10);
      const spent = entries.filter((e) => e.date >= b.start && e.date >= cursor && e.date < next).reduce((s, e) => s + budgetSpend(e, b), 0);
      carry = Math.max(0, b.amount + carry - spent); cursor = next;
    }
  }
  const spent = entries.filter((e) => e.date >= currentStart && e.date <= today && e.date <= end).reduce((s, e) => s + budgetSpend(e, b), 0);
  const allowance = b.amount + carry;
  const elapsed = Math.max(1, (Date.parse(today) - Date.parse(currentStart)) / 864e5 + 1);
  const length = Math.max(1, (Date.parse(end) - Date.parse(currentStart)) / 864e5 + 1);
  return { spent, carry, allowance, remaining: allowance - spent, percent: allowance ? (spent / allowance) * 100 : 0, estimate: (spent / elapsed) * length, end };
}
