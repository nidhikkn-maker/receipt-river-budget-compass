import { describe, it, expect } from 'vitest';
import { confirmAction, settleConfirm, subscribeConfirm } from './confirm';

describe('in-app confirmation', () => {
  it('cancel resolves false so nothing proceeds', async () => {
    const shown: string[] = [];
    const off = subscribeConfirm(p => { if (p) shown.push(p.message); });
    const result = confirmAction('Read PDF?');
    expect(shown).toEqual(['Read PDF?']);
    settleConfirm(false);
    expect(await result).toBe(false);
    off();
  });
  it('allow resolves true and queued requests show in order', async () => {
    const shown: string[] = [];
    const off = subscribeConfirm(p => { if (p) shown.push(p.message); });
    const a = confirmAction('A'), b = confirmAction('B');
    settleConfirm(true); settleConfirm(false);
    expect([await a, await b]).toEqual([true, false]);
    expect(shown).toEqual(['A', 'B']);
    off();
  });
});
