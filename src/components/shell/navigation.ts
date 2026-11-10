/**
 * Signature Flow navigation model (UIX master §5). Pure: which destination a page belongs to, what the
 * breadcrumbs say and where Back returns. Every existing URL keeps working; the shell only groups them.
 */

export type SectionId = "home" | "money" | "tasks" | "records" | "reports" | "calendar" | "notifications" | "add" | "settings" | "search";

export interface Destination { id: SectionId; to: string; label: string }

/** Desktop and iPad rail, in order (capture 01). Add is the last item. */
export const RAIL: readonly Destination[] = [
  { id: "home", to: "/home", label: "Home" },
  { id: "money", to: "/money", label: "Money" },
  { id: "tasks", to: "/tasks", label: "To-do" },
  { id: "records", to: "/records", label: "Records" },
  { id: "reports", to: "/reports", label: "Reports" },
  { id: "add", to: "/add", label: "Add" },
];

/** iPhone bottom bar (capture 02): Add sits in the centre; Reports lives under Records and in search. */
export const BOTTOM_BAR: readonly Destination[] = [
  { id: "home", to: "/home", label: "Home" },
  { id: "money", to: "/money", label: "Money" },
  { id: "add", to: "/add", label: "Add" },
  { id: "tasks", to: "/tasks", label: "To-do" },
  { id: "records", to: "/records", label: "Records" },
];

export const SECTION_ROOT: Record<SectionId, { to: string; label: string }> = {
  home: { to: "/home", label: "Home" },
  money: { to: "/money", label: "Money" },
  tasks: { to: "/tasks", label: "To-do" },
  records: { to: "/records", label: "Records" },
  reports: { to: "/reports", label: "Reports" },
  calendar: { to: "/calendar", label: "Calendar" },
  notifications: { to: "/notifications", label: "Notifications" },
  add: { to: "/add", label: "Add" },
  settings: { to: "/settings", label: "Settings" },
  search: { to: "/search", label: "Search" },
};

/** Today's pages and the destination they now sit under. Prefix match on the first path segment. */
const SECTION_OF: Record<string, SectionId> = {
  "": "home", home: "home", dashboard: "home", spaces: "home", start: "home",
  money: "money", wealth: "money", cards: "money", transfers: "money", "payment-methods": "money", receivables: "money",
  allocation: "money", budgets: "money", forecast: "money", strategy: "money", "account-reconciliation": "money", plan: "money",
  tasks: "tasks", inbox: "tasks", "transaction-review": "tasks", drafts: "tasks", "sync-queue": "tasks", "records-check": "tasks", reconcile: "tasks",
  records: "records", vault: "records", statements: "records", expenses: "records", trips: "records", "travel-inbox": "records",
  "claim-submission": "records", "reimbursement-settings": "records", assets: "records", entities: "records", shared: "records",
  "offline-receipts": "records", "historical-import": "records", "statement-accounts": "records", "upload-requests": "records",
  "company-spending": "records", "gst-check": "records", family: "records", connections: "records", patterns: "records",
  "statement-crosscheck": "records", "forex-reconcile": "records",
  reports: "reports", "report-centre": "reports", "report-status": "reports", "expenditure-statement": "reports", review: "reports",
  brief: "reports", audit: "reports", tax: "reports",
  calendar: "calendar", notifications: "notifications", add: "add", new: "add",
  settings: "settings", rules: "settings", "classification-rules": "settings", assistant: "settings", assistants: "settings",
  search: "search",
};

/** Plain titles for the breadcrumb of today's pages (names follow the More directory). */
const TITLES: Record<string, string> = {
  home: "Home", dashboard: "Home", money: "Money", tasks: "To-do", records: "Records", reports: "Reports", calendar: "Calendar",
  notifications: "Notifications", add: "Add", settings: "Settings", search: "Search", inbox: "Financial Inbox", wealth: "Accounts & investments",
  cards: "Card", transfers: "Transfers", "payment-methods": "Payment methods", receivables: "Money others owe me", allocation: "Where my money is",
  budgets: "Budgets", forecast: "Forecast", strategy: "What if…", plan: "Plan", vault: "Document Repository", statements: "Statement Desk",
  expenses: "Activity", trips: "Travel", "travel-inbox": "Travel inbox", "claim-submission": "Reimbursements", assets: "Assets & property",
  entities: "Companies & years", shared: "Shared files", drafts: "Saved drafts", "sync-queue": "Waiting to sync", "report-centre": "Reports & exports",
  "report-status": "Report progress", "expenditure-statement": "Spending statement", review: "Monthly review", brief: "Weekly brief", audit: "Checks & history",
  tax: "Income tax & GST", spaces: "Spaces", start: "Getting started", family: "Family", "account-reconciliation": "Check my balances",
  "records-check": "Records check", "historical-import": "Past imports", "statement-accounts": "Statement accounts", "upload-requests": "Accountant uploads",
  "company-spending": "Company spending", "gst-check": "Suppliers & invoices", "offline-receipts": "Offline receipts", new: "New entry",
  rules: "Sorting rules", assistant: "Financial assistant", assistants: "Connected assistants",
};

const segment = (path: string) => (path.split("?")[0] ?? "").split("#")[0]!.replace(/^\/+/, "").split("/")[0] ?? "";

export function sectionOf(path: string): SectionId | null {
  return SECTION_OF[segment(path)] ?? null;
}

export function titleOf(path: string): string {
  const seg = segment(path);
  return TITLES[seg] ?? (seg ? seg.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()) : "Home");
}

/** The rail/bottom-bar item to highlight. Calendar and Notifications highlight nothing in the bar. */
export function activeDestination(path: string): SectionId | null {
  const s = sectionOf(path);
  return s && ["home", "money", "tasks", "records", "reports", "add"].includes(s) ? s : null;
}

const pathOnly = (href: string) => (href.split("?")[0] ?? "").split("#")[0]!.replace(/\/+$/, "") || "/";
const isHome = (href: string) => sectionOf(href) === "home" && ["/", "/home", "/dashboard"].includes(pathOnly(href));
export const isSectionRoot = (href: string) => Object.values(SECTION_ROOT).some((r) => r.to === pathOnly(href));

export interface Crumb { label: string; to?: string }

/**
 * Records group (KK decision 7): Travel sits under Records with the Records modules as contextual sub-navigation.
 * Travel keeps its URLs (/trips, /trips/<id>, /travel-inbox), so old links and deep links work unchanged;
 * /records/travel is an extra Records-scoped address that redirects to /trips.
 */
export const RECORDS_TABS: readonly { key: string; label: string; to: string; match: readonly string[] }[] = [
  { key: "overview", label: "Overview", to: "/records", match: ["records"] },
  { key: "documents", label: "Documents", to: "/vault", match: ["vault"] },
  { key: "travel", label: "Travel", to: "/trips", match: ["trips", "travel-inbox"] },
  { key: "assets", label: "Assets", to: "/assets", match: ["assets"] },
  { key: "claims", label: "Reimbursements", to: "/claim-submission", match: ["claim-submission"] },
];
const TRAVEL_SEGMENTS = new Set(["trips", "travel-inbox"]);

/** The Records sub-navigation tab for a page, or null where the row is not shown (the Records hub draws its own). */
export function recordsTabOf(path: string): string | null {
  const seg = segment(path);
  if (seg === "records") return null;
  return RECORDS_TABS.find((t) => t.match.includes(seg))?.key ?? null;
}

/**
 * Breadcrumbs follow the real path (§5.1): a page opened from Reports shows Reports, not Home → page.
 * `from` is the in-app location the person came from, if known.
 */
export function breadcrumbs(current: string, from?: string | null): Crumb[] {
  if (isHome(current)) return [];
  const here = { label: titleOf(current) };
  const home = { label: "Home", to: "/home" };
  // Travel always reads Home › Records › Travel (› trip), whichever page opened it; Back still returns to the origin.
  if (TRAVEL_SEGMENTS.has(segment(current))) {
    const records = { label: "Records", to: "/records" };
    const parts = pathOnly(current).split("/").filter(Boolean);
    if (parts[0] === "trips" && parts.length > 1) return [home, records, { label: "Travel", to: "/trips" }, { label: "Trip" }];
    if (parts[0] === "travel-inbox") return [home, records, { label: "Travel", to: "/trips" }, here];
    return [home, records, here];
  }
  if (isSectionRoot(current)) return [home, here];
  if (from && pathOnly(from) !== pathOnly(current) && !isHome(from)) return [home, { label: titleOf(from), to: from }, here];
  const s = sectionOf(current);
  const root = s ? SECTION_ROOT[s] : null;
  return root && root.to !== pathOnly(current) && s !== "home" ? [home, { label: root.label, to: root.to }, here] : [home, here];
}

/** Where Back goes: the page you came from, else the destination this page sits under, else Home. */
export function backTarget(current: string, from?: string | null): { to: string; label: string } {
  if (from && pathOnly(from) !== pathOnly(current)) return { to: from, label: titleOf(from) };
  const s = sectionOf(current);
  const root = s && !isSectionRoot(current) ? SECTION_ROOT[s] : SECTION_ROOT.home;
  return { to: root.to, label: root.label };
}

/** Signature Flow pages draw their own header with breadcrumbs; the shell adds the row for every other page. */
const OWN_HEADER = new Set(["/", "/home", "/dashboard", "/money", "/tasks", "/records", "/calendar", "/notifications", "/add"]);
export const ownsHeader = (path: string) => OWN_HEADER.has(pathOnly(path));

/** Whether a page shows the Back row at all (Home and the four main hubs are starting points on iPhone). */
export function showsBack(current: string): boolean {
  return !isHome(current);
}

/**
 * In-app trail of visited locations, so Back and breadcrumbs know the real origin even across
 * browser back/forward. PUSH adds, REPLACE swaps the top, BACK/FORWARD move within what was seen.
 */
export interface Trail { entries: string[]; index: number }
export type TrailAction = "PUSH" | "REPLACE" | "BACK" | "FORWARD" | "GO";
export const emptyTrail = (href: string): Trail => ({ entries: [href], index: 0 });

export function stepTrail(t: Trail, action: TrailAction, href: string): Trail {
  if (action === "REPLACE") { const entries = [...t.entries]; entries[t.index] = href; return { entries, index: t.index }; }
  if (action === "BACK" || action === "FORWARD" || action === "GO") {
    const before = t.entries.slice(0, t.index).lastIndexOf(href);
    const after = t.entries.indexOf(href, t.index + 1);
    const at = action === "BACK" ? before : action === "FORWARD" ? after : before >= 0 ? before : after;
    if (at >= 0) return { entries: t.entries, index: at };
    return { entries: [...t.entries.slice(0, t.index + 1), href], index: t.index + 1 };
  }
  if (t.entries[t.index] === href) return t;
  const entries = [...t.entries.slice(0, t.index + 1), href].slice(-50);
  return { entries, index: entries.length - 1 };
}

export const trailFrom = (t: Trail): string | null => (t.index > 0 ? t.entries[t.index - 1] ?? null : null);

/** Reports must be reachable within two taps from Home on iPhone: Records (bar) → Reports (row). */
export const IPHONE_REPORTS_PATH = ["/records", "/reports"] as const;
