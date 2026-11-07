import { describe, expect, it } from 'vitest';
import { MODULE_GROUPS, searchModules } from './ModuleDirectory';

describe('More directory', () => {
  it('opens on a short list of categories', () => { expect(MODULE_GROUPS.length).toBeLessThanOrEqual(8); });
  it('finds a page by part of its name', () => { expect(searchModules('claim').map(m => m.to)).toContain('/claim-submission'); });
  it('returns nothing for an empty search', () => { expect(searchModules('  ')).toEqual([]); });
});
