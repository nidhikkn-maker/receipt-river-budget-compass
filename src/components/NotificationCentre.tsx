/**
 * B05 Notification centre screen. Grouped notices from existing reminder, review and statement sources
 * (src/lib/notification-centre.ts); read/unread kept per owner on this device; each notice opens its record.
 * Track B owns the shell link (bell) to /notifications.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { BellOff, CheckCheck } from "lucide-react";
import { PageTitle } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { LoadError } from "@/components/LoadError";
import { useStore } from "@/lib/store";
import { inboxItems } from "@/lib/inbox";
import { todayISO } from "@/lib/use-position";
import { loadFailed } from "@/lib/load-state";
import { splitByTableArchive } from "@/lib/records-archive";
import { buildNotices, groupNotices, loadRead, saveRead, SEVERITY_LABEL, type Notice } from "@/lib/notification-centre";
import { cn } from "@/lib/utils";

const storage = () => { try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; } };
const TONE = { high: "bg-destructive text-destructive-foreground", medium: "bg-secondary text-secondary-foreground", low: "bg-muted text-muted-foreground" } as const;

export function NotificationCentre() {
  const { userId, transactions, accounts, commitments, documents, preferences, pendingCount, loadErrors, refresh } = useStore();
  const today = todayISO();
  const notices = useMemo(() => {
    const docs = splitByTableArchive(preferences, "documents", documents).active;
    const items = inboxItems({ transactions, accounts, commitments, prefs: preferences, today, pendingCount });
    return buildNotices({ items, dismissed: preferences.inboxDismissed ?? [], accounts, documents: docs, uploads: preferences.statementUploads ?? [], today });
  }, [transactions, accounts, commitments, documents, preferences, today, pendingCount]);
  const [read, setRead] = useState<Set<string>>(() => loadRead(userId, storage()));
  useEffect(() => { setRead(loadRead(userId, storage())); }, [userId]);
  const mark = (keys: string[]) => setRead((r) => { const n = new Set([...r, ...keys]); saveRead(userId, storage(), n, notices); return n; });
  const markUnread = (key: string) => setRead((r) => { const n = new Set(r); n.delete(key); saveRead(userId, storage(), n, notices); return n; });
  const groups = groupNotices(notices, read);
  const unread = notices.filter((n) => !read.has(n.key)).length;
  const failed = loadFailed(loadErrors, "transactions", "accounts", "payments", "documents", "settings");
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageTitle title="Notifications" sub={notices.length ? `${unread} unread · ${notices.length} in total` : "Reminders from your records appear here."} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={!unread} onClick={() => mark(notices.map((n) => n.key))}><CheckCheck className="h-4 w-4" />Mark all read</Button>
        <Button asChild size="sm" variant="ghost"><Link to="/settings" hash="notifications">Notification settings</Link></Button>
      </div>
      {failed && <LoadError what="some of your records" onRetry={refresh} note="Notifications may be missing until they load. Nothing has been deleted." />}
      {!notices.length && !failed && <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground"><BellOff className="mx-auto mb-2 h-5 w-5" aria-hidden />Nothing needs your attention right now.</div>}
      {groups.map((g) => (
        <section key={g.group} aria-label={g.group} className="rounded-2xl border bg-card">
          <div className="flex items-center justify-between gap-2 border-b px-4 py-2"><h2 className="font-semibold">{g.group}</h2><span className="text-xs text-muted-foreground">{g.unread ? `${g.unread} unread` : "All read"}</span></div>
          <ul className="divide-y">{g.notices.map((n) => <NoticeRow key={n.key} n={n} isRead={read.has(n.key)} onOpen={() => mark([n.key])} onToggle={() => (read.has(n.key) ? markUnread(n.key) : mark([n.key]))} />)}</ul>
        </section>
      ))}
      <section aria-label="Not available yet" className="rounded-2xl border border-dashed p-4 text-sm">
        <h2 className="font-semibold">Proposed, not built yet</h2>
        <p className="text-muted-foreground">Snooze, alert thresholds per type and delivery status are planned. Read marks are kept on this device only. Phone alerts are set in Notification settings.</p>
      </section>
    </div>
  );
}

function NoticeRow({ n, isRead, onOpen, onToggle }: { n: Notice; isRead: boolean; onOpen: () => void; onToggle: () => void }) {
  const router = useRouter();
  const open = (e: React.MouseEvent) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); onOpen(); void router.navigate({ href: n.link.href }); };
  return (
    <li className={cn("flex items-start gap-3 px-4 py-3", !isRead && "bg-secondary/40")}>
      <span aria-hidden className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", isRead ? "bg-transparent" : "bg-primary")} />
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-medium">{n.title}{!isRead && <span className="sr-only"> (unread)</span>}</p>
        <p className="break-words text-xs text-muted-foreground">{n.detail}</p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs"><span className={cn("rounded-full px-2 py-0.5", TONE[n.severity])}>{SEVERITY_LABEL[n.severity]}</span><span className="text-muted-foreground">{n.source}{n.date ? ` · ${n.date}` : ""}</span></p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Button asChild size="sm" variant="outline"><a href={n.link.href} onClick={open} aria-label={`${n.link.label}: ${n.title}`}>{n.link.label}</a></Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onToggle}>{isRead ? "Mark unread" : "Mark read"}</Button>
      </div>
    </li>
  );
}
