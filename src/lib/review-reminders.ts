import type { InboxItem } from './inbox';

export interface ReminderGroup { label: string; items: InboxItem[] }

const ORDER = ['Bills & payments', 'Money owed back to me', 'Business & company profile', 'Records checks', 'Figures to check', 'Waiting to sync', 'Other reminders'] as const;

/** Which plain group a non-transaction reminder belongs to. Company/profile checks stay apart from money reminders. */
export function reminderGroup(i: InboxItem): (typeof ORDER)[number] {
  if (i.type === 'commitment') return 'Bills & payments';
  if (i.type === 'pending_reimbursement') return 'Money owed back to me';
  if (i.type === 'pending_sync') return 'Waiting to sync';
  if (i.type === 'inconsistency') return 'Figures to check';
  if (i.type === 'audit') return /company|entity|profile|gst|pan|tan|cin|director|compliance|filing|tax/i.test(`${i.title} ${i.description}`) ? 'Business & company profile' : 'Records checks';
  return 'Other reminders';
}

/** Groups reminders and drops exact repeats (same group, title, description and amount), keeping the first. Display only. */
export function groupReminders(items: InboxItem[]): ReminderGroup[] {
  const seen = new Set<string>();
  const map = new Map<string, InboxItem[]>();
  for (const i of items) {
    const g = reminderGroup(i);
    const sig = [g, i.title.trim().toLowerCase(), i.description.trim().toLowerCase(), i.amount ?? ''].join('\u0000');
    if (seen.has(sig)) continue;
    seen.add(sig);
    map.set(g, [...(map.get(g) ?? []), i]);
  }
  return ORDER.filter(g => map.has(g)).map(label => ({ label, items: map.get(label)! }));
}
