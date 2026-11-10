/**
 * B05 Notification centre: pure rules that turn the app's existing reminder sources into grouped notices, each with a
 * severity and a direct destination. Nothing here is stored: notices are derived (like inbox.ts), so they clear when
 * the record is fixed. Only the read/unread marks are kept, per owner on this device.
 *
 * Sources (all already saved data): inboxItems() (review queue, balances, payments due, offline entries), document
 * expiry dates (documents.ts), unfinished statement uploads (preferences.statementUploads).
 */
import type { InboxItem, InboxType } from "./inbox";
import type { Account } from "./ledger";
import type { VaultDoc } from "./documents";
import type { StatementUpload } from "./preferences";
import { expiringDocuments } from "./documents";

export const NOTICE_GROUPS = ["Bills & payments", "Statements & balances", "Entries to review", "Money owed back to me", "Documents", "Waiting to sync", "Figures to check"] as const;
export type NoticeGroup = (typeof NOTICE_GROUPS)[number];
export type Severity = "high" | "medium" | "low";
export const SEVERITY_LABEL: Record<Severity, string> = { high: "Needs action", medium: "Soon", low: "For information" };

/** A destination inside the app: a route path with optional search and hash. */
export interface NoticeLink { href: string; label: string }
export interface Notice { key: string; group: NoticeGroup; severity: Severity; title: string; detail: string; date: string | null; link: NoticeLink; source: string }

const BANK_KINDS = new Set(["savings", "current", "cash", "wallet"]);
const REVIEW_FILTER: Partial<Record<InboxType, string>> = { uncategorised: "category", missing_details: "missing", duplicate: "conflict" };
const REVIEW_NAME: Partial<Record<InboxType, [string, string]>> = {
  uncategorised: ["entry needs a category", "entries need a category"], unverified_import: ["imported entry to confirm", "imported entries to confirm"],
  missing_details: ["entry is missing a detail", "entries are missing a detail"], duplicate: ["possible double entry", "possible double entries"],
  inconsistency: ["entry's figures don't agree", "entries' figures don't agree"], pending_reimbursement: ["payment waiting to be paid back", "payments waiting to be paid back"],
};
const qs = (o: Record<string, string>) => `?${new URLSearchParams(o).toString()}`;

/** Where an account opens: bank-type accounts open their read-only detail page (C03); others open Wealth. */
export function accountHref(a: Pick<Account, "id" | "kind"> | undefined): string {
  return a && BANK_KINDS.has(a.kind) ? `/bank-account/${encodeURIComponent(a.id)}` : a?.kind === "credit_card" ? `/cards/${encodeURIComponent(a.id)}` : "/wealth";
}

export interface NoticeInput { items: InboxItem[]; dismissed: readonly string[]; accounts: Account[]; documents: VaultDoc[]; uploads: StatementUpload[]; today: string }

export function buildNotices(i: NoticeInput): Notice[] {
  const out: Notice[] = [];
  const dismissed = new Set(i.dismissed);
  const byName = (name: string | null) => i.accounts.find((a) => a.name === name);
  // Entry-level items are summarised per kind (one notice, opening the filtered review) so the centre stays readable.
  const perEntry = new Map<InboxType, InboxItem[]>();
  for (const it of i.items) {
    if (it.transactionId) { perEntry.set(it.type, [...(perEntry.get(it.type) ?? []), it]); continue; }
    if (dismissed.has(it.key)) continue; // dismissed reminders stay dismissed (restorable on /inbox)
    if (it.type === "commitment" && it.commitmentId) {
      out.push({ key: it.key, group: "Bills & payments", severity: it.priority, title: it.title, detail: `${it.description}${it.amount ? ` · ₹${it.amount.toLocaleString("en-IN")}` : ""}`, date: it.date, source: "Scheduled payment",
        link: { href: `/calendar-item${qs({ id: `commitment:${it.commitmentId}`, ...(it.date ? { date: it.date } : {}) })}`, label: "Open payment" } });
    } else if (it.type === "unreconciled_account" || (it.type === "inconsistency" && it.destination)) {
      const a = byName(it.accountName);
      out.push({ key: it.key, group: "Statements & balances", severity: it.priority, title: it.title, detail: it.description, date: it.date, source: "Account balance check",
        link: it.type === "inconsistency" && it.destination ? { href: it.destination, label: "Check statement" } : { href: accountHref(a), label: "Open account" } });
    } else if (it.type === "pending_sync") {
      out.push({ key: it.key, group: "Waiting to sync", severity: it.priority, title: it.title, detail: it.description, date: null, source: "This device", link: { href: "/inbox", label: "Open Review" } });
    } else {
      out.push({ key: it.key, group: "Figures to check", severity: it.priority, title: it.title, detail: it.description, date: it.date, source: "Review", link: { href: it.destination ?? "/inbox", label: "Open" } });
    }
  }
  for (const [type, list] of perEntry) {
    const n = list.length, names = REVIEW_NAME[type] ?? ["entry to check", "entries to check"];
    const latest = list.map((x) => x.date ?? "").sort().at(-1) || null;
    const high = list.some((x) => x.priority === "high"), medium = list.some((x) => x.priority === "medium");
    const filter = REVIEW_FILTER[type];
    out.push({ key: `entries:${type}:${n}:${latest ?? ""}`, group: type === "pending_reimbursement" ? "Money owed back to me" : "Entries to review", severity: high ? "high" : medium ? "medium" : "low",
      title: `${n} ${n === 1 ? names[0] : names[1]}`, detail: list.slice(0, 3).map((x) => x.title).join(", ") + (n > 3 ? ` and ${n - 3} more` : ""), date: latest, source: "Review",
      link: { href: type === "pending_reimbursement" ? "/claim-submission" : `/inbox${qs({ section: "review", ...(filter ? { filter } : {}) })}`, label: type === "pending_reimbursement" ? "Open claims" : "Open Review" } });
  }
  for (const d of expiringDocuments(i.documents, i.today)) {
    const past = d.expiresOn! < i.today;
    out.push({ key: `doc-expiry:${d.id}:${d.expiresOn}`, group: "Documents", severity: past ? "high" : "medium", title: d.title, detail: past ? `Expired on ${d.expiresOn}` : `Expires on ${d.expiresOn}`, date: d.expiresOn ?? null, source: "Document renewal", link: { href: "/vault", label: "Open document" } });
  }
  for (const u of i.uploads.filter((x) => x.status === "interrupted")) {
    out.push({ key: `upload:${u.id}`, group: "Statements & balances", severity: "high", title: u.label || "Statement upload", detail: `Upload of ${u.at.slice(0, 10)} did not finish. Open Statement Desk to resume — nothing is posted twice.`, date: u.at.slice(0, 10), source: "Statement Desk", link: { href: "/statements", label: "Resume upload" } });
  }
  const order: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity] || (b.date ?? "").localeCompare(a.date ?? ""));
}

export interface NoticeGroupView { group: NoticeGroup; notices: Notice[]; unread: number }
export function groupNotices(list: Notice[], read: ReadonlySet<string>): NoticeGroupView[] {
  return NOTICE_GROUPS.map((group) => { const notices = list.filter((n) => n.group === group); return { group, notices, unread: notices.filter((n) => !read.has(n.key)).length }; }).filter((g) => g.notices.length);
}

// Read marks: per owner on this device (browser storage), never financial data. Unknown keys are pruned on save.
export const readStorageKey = (owner: string) => `thapal-notice-read:${owner}`;
export function loadRead(owner: string, storage: Pick<Storage, "getItem"> | null): Set<string> {
  try { const raw = storage?.getItem(readStorageKey(owner)); const v: unknown = raw ? JSON.parse(raw) : []; return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []); } catch { return new Set(); }
}
export function saveRead(owner: string, storage: Pick<Storage, "setItem"> | null, read: ReadonlySet<string>, current: Notice[]): void {
  const live = new Set(current.map((n) => n.key));
  try { storage?.setItem(readStorageKey(owner), JSON.stringify([...read].filter((k) => live.has(k)))); } catch { /* storage blocked: marks last for this visit only */ }
}
