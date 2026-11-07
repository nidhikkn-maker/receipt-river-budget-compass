import { describe, expect, it } from 'vitest';
import { groupReminders } from './review-reminders';
import type { InboxItem } from './inbox';

const item = (p: Partial<InboxItem>): InboxItem => ({ key: Math.random().toString(), type: 'commitment', title: 'Rent', description: 'Due 5 Nov', amount: 20000, accountName: null, date: null, priority: 'medium', action: 'Open', ...p });

describe('groupReminders', () => {
  it('drops identical repeated reminders', () => {
    const g = groupReminders([item({ key: 'a' }), item({ key: 'b' })]);
    expect(g).toHaveLength(1);
    expect(g[0]!.items.map(i => i.key)).toEqual(['a']);
  });
  it('keeps reminders that differ in amount', () => {
    expect(groupReminders([item({}), item({ amount: 21000 })])[0]!.items).toHaveLength(2);
  });
  it('separates company profile checks from money reminders', () => {
    const g = groupReminders([item({}), item({ type: 'audit', title: 'Entity profile · Acme Pvt Ltd', description: 'GSTIN missing' })]);
    expect(g.map(x => x.label)).toEqual(['Bills & payments', 'Business & company profile']);
  });
});
