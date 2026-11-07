export const SHORTCUTS = [
  { id: "scan", label: "Scan receipt", group: "Capture", to: "/new" },
  { id: "expense", label: "Add expense", group: "Capture", to: "/new" },
  { id: "inbox", label: "Financial inbox", group: "Capture", to: "/inbox" },
  { id: "travel", label: "Travel Manager", group: "Travel", to: "/trips" },
  { id: "upcoming-trips", label: "Upcoming trips", group: "Travel", to: "/trips" },
  { id: "create-trip", label: "Create trip", group: "Travel", to: "/trips" },
  { id: "search", label: "Universal search", group: "Finance", to: "/search" },
  { id: "payments", label: "Upcoming payments", group: "Finance", to: "/plan" },
  { id: "accounts", label: "Accounts", group: "Finance", to: "/wealth" },
  { id: "cards", label: "Credit cards", group: "Finance", to: "/wealth" },
  { id: "reimbursements", label: "Reimbursements", group: "Finance", to: "/reports" },
  { id: "budgets", label: "Budgets", group: "Finance", to: "/budgets" },
  { id: "reports", label: "Reports", group: "Insights", to: "/report-centre" },
  { id: "insights", label: "Financial insights", group: "Insights", to: "/reports" },
  { id: "assistant", label: "AI assistant", group: "Insights", to: "/assistant" },
  { id: "wealth", label: "Wealth", group: "Finance", to: "/wealth" },
  { id: "documents", label: "Documents", group: "Capture", to: "/vault" },
] as const;
export type ShortcutId = (typeof SHORTCUTS)[number]["id"];
export const DEFAULT_SHORTCUTS: ShortcutId[] = ["scan", "inbox", "travel", "search", "payments", "reports"];
export function cleanShortcuts(raw: unknown): ShortcutId[] {
  if (!Array.isArray(raw)) return [...DEFAULT_SHORTCUTS];
  return [...new Set(raw.filter((id): id is ShortcutId => SHORTCUTS.some((s) => s.id === id)))];
}
export function primaryShortcuts(ids: ShortcutId[]) { return ids.slice(0, 6); }
export function moveShortcut(ids: ShortcutId[], id: ShortcutId, target: number): ShortcutId[] {
  if (!ids.includes(id)) return ids;
  const next = ids.filter((x) => x !== id);
  next.splice(Math.max(0, Math.min(next.length, target)), 0, id);
  return next;
}