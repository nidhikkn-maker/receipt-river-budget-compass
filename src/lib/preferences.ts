import type { AutopilotAction } from "./autopilot";
import type { CoolingOffItem } from "./cooling-off";
import type { ContractObligation } from "./contracts";
import type { DecisionMemory } from "./memory";
import type { MapLink } from "./graph";
import type { PaymentInstrument } from "./payment-instruments";
import type { AllocationPlan } from "./allocation";
import type { FinanceRule } from "./rules-engine";
import { cleanShortcuts, DEFAULT_SHORTCUTS, type ShortcutId } from "./home-shortcuts";
import { CATEGORIES, memberShares, SCOPES, type Expense, type Scope } from "./expenses";
import { cleanThemeName, type ThemeName } from "./themes";
import { defaultEmergency, type BriefSettings, type EmergencySettings, type MerchantAliases, type Milestone, type Trip, type WeeklyBrief } from "./intelligence";

export interface CategorySetting { name: string; archived: boolean }
export interface GroupedTag { group: string; name: string }
export interface ScopedBudget { id: string; name: string; amount: number; period: "monthly" | "annual"; kind: "overall" | "category" | "person" | "project" | "travel"; value: string; start: string; carry: boolean }
export type Language = "en" | "hi" | "ta" | "te" | "kn" | "ml" | "mr" | "bn" | "gu";
export const LANGUAGES: Record<Language, string> = { en: "English", hi: "हिन्दी (Hindi)", ta: "தமிழ் (Tamil)", te: "తెలుగు (Telugu)", kn: "ಕನ್ನಡ (Kannada)", ml: "മലയാളം (Malayalam)", mr: "मराठी (Marathi)", bn: "বাংলা (Bengali)", gu: "ગુજરાતી (Gujarati)" };
export const HOME_SECTIONS = ["overview", "readiness", "metrics", "insights", "upcoming", "briefing", "travel", "recent"] as const;
export const HOME_SECTION_LABEL: Record<(typeof HOME_SECTIONS)[number], string> = {
  overview: "Financial overview", readiness: "Financial readiness", metrics: "Key figures", insights: "Spending insights",
  upcoming: "Upcoming commitments", briefing: "AI briefing", travel: "Travel", recent: "Recent activity",
};

export type HomeMode = "daily" | "executive" | "minimal" | "custom";
export const HOME_MODE_LABEL: Record<Exclude<HomeMode, "custom">, string> = { daily: "Daily", executive: "Executive", minimal: "Minimal" };
/** V5.0 §7.1 home arrangements: which sections show, in which order. */
export const HOME_MODES: Record<Exclude<HomeMode, "custom">, string[]> = {
  daily: ["overview", "readiness", "upcoming", "recent", "metrics"],
  executive: ["overview", "metrics", "readiness", "upcoming", "insights", "briefing", "travel"],
  minimal: ["overview", "recent", "upcoming"],
};
/** Applies a home mode: chosen sections first, the rest hidden. */
export function applyHomeMode(p: FinancePreferences, mode: Exclude<HomeMode, "custom">): FinancePreferences {
  const shown = HOME_MODES[mode];
  return { ...p, homeMode: mode, homeOrder: [...shown, ...HOME_SECTIONS.filter((x) => !shown.includes(x))], homeHidden: HOME_SECTIONS.filter((x) => !shown.includes(x)) };
}

export interface SavedView { id: string; name: string; filters: Record<string, string> }
/** Keeps saved Transactions views well-formed: named, string-valued filters, at most 20. */
export function sanitizeSavedViews(raw: unknown): SavedView[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v) => v && typeof v.id === "string" && typeof v.name === "string" && v.name.trim() && v.filters && typeof v.filters === "object")
    .slice(0, 20).map((v) => ({ id: v.id, name: String(v.name).trim().slice(0, 40), filters: Object.fromEntries(Object.entries(v.filters).filter(([, x]) => typeof x === "string" && x !== "")) as Record<string, string> }));
}

export interface FinancePreferences {
  homeShortcuts: ShortcutId[];
  /** Named Transactions filter combinations (V5.0 saved views). */
  savedViews: SavedView[];
  /** Home arrangement; "custom" once the user hides or reorders sections themselves. */
  homeMode: HomeMode;
  categories: CategorySetting[];
  tags: GroupedTag[];
  budgets: ScopedBudget[];
  homeHidden: string[];
  homeOrder: string[];
  theme: "light" | "dark" | "system";
  /** Visual style family (Version 4.3 theme system). */
  themeName: ThemeName;
  /** Workspace the Home overview focuses on; "all" shows everything. */
  homeScope: "all" | Scope;
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
  homePeriod: "day" | "week" | "month" | "custom";
  /** Custom overview range (ISO dates), used when homePeriod is "custom". */
  homeCustomStart: string;
  homeCustomEnd: string;
  /** Days before account data needs review / is outdated; per-account overrides by account id. */
  freshness: { reviewDays: number; outdatedDays: number; perAccount: Record<string, { reviewDays: number; outdatedDays: number }> };
  /** Inbox item keys the user dismissed. */
  inboxDismissed: string[];
  /** Latest statement balance the user entered per account id. */
  statementBalances: Record<string, { balance: number; date: string }>;
  /** Saved category split templates (percentages). */
  splitTemplates: { name: string; lines: { category: string; pct: number }[] }[];
  emergency: EmergencySettings;
  /** Irregular-expense predictions the user rejected (by key); confirmed ones become yearly commitments. */
  irregularRejected: string[];
  irregularConfirmed: string[];
  milestones: Milestone[];
  trips: Trip[];
  merchantAliases: MerchantAliases;
  brief: BriefSettings;
  briefs: { id: string; generatedAt: string; data: WeeklyBrief }[];
  /** Saved payment methods (UPI IDs, cards, wallets…), each linked to an account. */
  paymentInstruments: PaymentInstrument[];
  /** Saved income allocation plans (internal plans — they never move money). */
  allocationPlans: AllocationPlan[];
  /** Financial monitoring rules (templates + custom). */
  rules: FinanceRule[];
  /** Rule-alert keys the user dismissed (ruleId + message hash). */
  ruleDismissed: string[];
  /** Autopilot accept/dismiss/later choices keyed by recommendation key. */
  autopilotActions: Record<string, AutopilotAction>;
  /** Purchase cooling-off queue (proposals, never expenses). */
  coolingOff: CoolingOffItem[];
  /** Obligations read from vault documents, pending review or decided. */
  contractObligations: ContractObligation[];
  /** Financial memory: decisions with expected vs actual outcome. */
  decisions: DecisionMemory[];
  /** User-drawn links on the money map, each with a reason. */
  mapLinks: MapLink[];
  /** Saved money-map box positions keyed by node id (layout only). */
  mapPositions: Record<string, { x: number; y: number }>;
  /** Entry ids marked as favourites for "Repeat expense" (copied as new drafts, never re-saved). */
  favouriteEntries: string[];
  /** Guided setup assistant: shown until finished or dismissed; reopenable from Settings. */
  setupAssistant: "pending" | "done";
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
    categories: CATEGORIES.map((name) => ({ name, archived: false })), tags: DEFAULT_TAGS, budgets: [], homeHidden: [], homeOrder: [...HOME_SECTIONS], homeMode: "custom", savedViews: [], homeShortcuts: [...DEFAULT_SHORTCUTS],
    theme: "system", themeName: "signature", homeScope: "all", reminders: true, reminderDays: 3, defaultCurrency: "INR", language: "en", aiEnabled: true, aiReadsDocuments: true, cardAlertPct: 30, homePeriod: "month", homeCustomStart: "", homeCustomEnd: "",
    freshness: { reviewDays: 14, outdatedDays: 45, perAccount: {} }, inboxDismissed: [], statementBalances: {}, splitTemplates: [],
    emergency: defaultEmergency(), irregularRejected: [], irregularConfirmed: [], milestones: [], trips: [], merchantAliases: {}, brief: { enabled: true, day: 1, hour: 8 }, briefs: [], paymentInstruments: [],
    allocationPlans: [], rules: [], ruleDismissed: [], autopilotActions: {}, coolingOff: [], contractObligations: [], decisions: [], mapLinks: [], mapPositions: {}, favouriteEntries: [], setupAssistant: "pending",
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
  p.savedViews = sanitizeSavedViews(p.savedViews);
  p.homeShortcuts = cleanShortcuts(p.homeShortcuts);
  if (!["daily", "executive", "minimal", "custom"].includes(p.homeMode)) p.homeMode = "custom";
  p.reminderDays = Number.isFinite(p.reminderDays) ? Math.min(30, Math.max(0, Math.round(p.reminderDays))) : d.reminderDays;
  p.cardAlertPct = Number.isFinite(p.cardAlertPct) ? Math.min(100, Math.max(5, Math.round(p.cardAlertPct))) : d.cardAlertPct;
  if (!/^[A-Z]{3}$/.test(p.defaultCurrency ?? "")) p.defaultCurrency = "INR";
  if (!(p.language in LANGUAGES)) p.language = "en";
  if (!["day", "week", "month", "custom"].includes(p.homePeriod)) p.homePeriod = "month";
  p.themeName = cleanThemeName(p.themeName);
  if (p.homeScope !== "all" && !(SCOPES as readonly string[]).includes(p.homeScope)) p.homeScope = "all";
  const iso = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
  p.homeCustomStart = iso(p.homeCustomStart);
  p.homeCustomEnd = iso(p.homeCustomEnd);
  if (p.homeCustomStart && p.homeCustomEnd && p.homeCustomStart > p.homeCustomEnd) [p.homeCustomStart, p.homeCustomEnd] = [p.homeCustomEnd, p.homeCustomStart];
  const f = p.freshness ?? d.freshness;
  const days = (n: unknown, def: number) => (Number.isFinite(n) ? Math.min(365, Math.max(1, Math.round(n as number))) : def);
  p.freshness = { reviewDays: days(f.reviewDays, 14), outdatedDays: days(f.outdatedDays, 45), perAccount: f.perAccount && typeof f.perAccount === "object" ? f.perAccount : {} };
  if (p.freshness.outdatedDays <= p.freshness.reviewDays) p.freshness.outdatedDays = p.freshness.reviewDays + 1;
  if (!Array.isArray(p.inboxDismissed)) p.inboxDismissed = [];
  p.inboxDismissed = p.inboxDismissed.slice(-500);
  if (!p.statementBalances || typeof p.statementBalances !== "object") p.statementBalances = {};
  if (!Array.isArray(p.splitTemplates)) p.splitTemplates = [];
  p.emergency = { ...defaultEmergency(), ...(p.emergency ?? {}) };
  p.emergency.targetMonths = Number.isFinite(p.emergency.targetMonths) ? Math.min(24, Math.max(1, p.emergency.targetMonths)) : 6;
  for (const k of ["irregularRejected", "irregularConfirmed", "milestones", "trips", "briefs", "paymentInstruments", "allocationPlans", "rules", "ruleDismissed", "coolingOff", "contractObligations", "decisions", "mapLinks"] as const) if (!Array.isArray(p[k])) (p as unknown as Record<string, unknown[]>)[k] = [];
  p.allocationPlans = p.allocationPlans.slice(0, 60);
  p.ruleDismissed = p.ruleDismissed.slice(-500);
  p.coolingOff = p.coolingOff.slice(-200);
  p.contractObligations = p.contractObligations.slice(-300);
  p.decisions = p.decisions.slice(-300);
  p.mapLinks = p.mapLinks.slice(-500);
  p.mapPositions = cleanMapPositions(p.mapPositions);
  p.setupAssistant = p.setupAssistant === "done" ? "done" : "pending";
  p.favouriteEntries = Array.isArray(p.favouriteEntries) ? [...new Set(p.favouriteEntries.filter((x): x is string => typeof x === "string"))].slice(-30) : [];
  if (!p.autopilotActions || typeof p.autopilotActions !== "object" || Array.isArray(p.autopilotActions)) p.autopilotActions = {};
  p.autopilotActions = Object.fromEntries(Object.entries(p.autopilotActions).slice(-300));
  p.briefs = p.briefs.slice(0, 26);
  if (!p.merchantAliases || typeof p.merchantAliases !== "object") p.merchantAliases = {};
  p.brief = { ...d.brief, ...(p.brief ?? {}) };
  return p;
}

export const tagValue = (t: GroupedTag) => `${t.group}: ${t.name}`;
export const tagsInGroup = (tags: GroupedTag[], group: string) => tags.filter((t) => t.group === group).map(tagValue);
/** Only accept a suggestion that names an active saved category. Unknown values require review. */
export function resolveCategory(categories: CategorySetting[], suggestion: string | null | undefined): string | null {
  if (!suggestion) return null;
  return categories.find(c => !c.archived && c.name.toLowerCase() === suggestion.trim().toLowerCase())?.name ?? null;
}
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

/** Keep only finite, in-bounds map positions (max 800 entries). */
export function cleanMapPositions(raw: unknown): Record<string, { x: number; y: number }> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, { x: number; y: number }> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(-800)) {
    const o = v as { x?: unknown; y?: unknown } | null;
    if (k.length > 200 || !o || typeof o.x !== "number" || typeof o.y !== "number" || !Number.isFinite(o.x) || !Number.isFinite(o.y)) continue;
    out[k] = { x: Math.min(4000, Math.max(0, Math.round(o.x))), y: Math.min(4000, Math.max(30, Math.round(o.y))) };
  }
  return out;
}
