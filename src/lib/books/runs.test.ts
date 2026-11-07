// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { sha256Hex } from '../private-files';
const cloud = vi.hoisted(() => ({ download: vi.fn(), remove: vi.fn(), update: vi.fn(), upload: vi.fn(), select: vi.fn(), insert: vi.fn(), patches: [] as Record<string, unknown>[] }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { user: { id: 'synthetic-owner' } } } }) },
  storage: { from: () => cloud }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: cloud.select }) }), insert: cloud.insert, update: (patch: Record<string, unknown>) => { cloud.patches.push(patch); return { eq: cloud.update }; } })
} }));
import { closeRun, runFile, startRun, verifyRunOriginal, type DocRun } from './runs';
const bytes = new Blob(['original invoice']);
const base: DocRun = { id: 'run', fileName: 'invoice.pdf', context: '', stage: 'Confirm', status: 'waiting', error: null, documentId: null, data: {}, attempts: 1, updatedAt: '2026-11-07' };
beforeEach(() => { vi.clearAllMocks(); cloud.patches = []; });
it('resumed original passes only with its original size and digest', async () => {
  const expected = { size: bytes.size, sha256: await sha256Hex(await bytes.arrayBuffer()), stashPath: 'synthetic-owner/runs/run' };
  cloud.download.mockResolvedValue({ data: bytes, error: null });
  expect(await (await runFile({ ...base, data: expected })).text()).toBe('original invoice');
});
it('same-size corrupted original is refused before resumed extraction or saving', async () => {
  const expected = { size: bytes.size, sha256: await sha256Hex(await bytes.arrayBuffer()), stashPath: 'synthetic-owner/runs/run' };
  cloud.download.mockResolvedValue({ data: new Blob(['modified invoice']), error: null });
  await expect(runFile({ ...base, data: expected })).rejects.toThrow('integrity check failed');
  expect(cloud.update).not.toHaveBeenCalled();
});
it('empty, truncated and legacy unverified originals require fresh review', async () => {
  const expected = { size: bytes.size, sha256: await sha256Hex(await bytes.arrayBuffer()) };
  await expect(verifyRunOriginal(new Blob(), expected)).rejects.toThrow('integrity check failed');
  await expect(verifyRunOriginal(new Blob(['short']), expected)).rejects.toThrow('integrity check failed');
  await expect(verifyRunOriginal(bytes, { size: bytes.size })).rejects.toThrow('older upload');
});
it('a failed parked upload never creates an accepted run', async () => {
  cloud.select.mockResolvedValue({ data: null, error: null }); cloud.upload.mockResolvedValue({ error: { message: 'outage' } });
  await expect(startRun('new', new File([bytes], 'invoice.pdf'), '')).rejects.toThrow('safely stored');
  expect(cloud.insert).not.toHaveBeenCalled();
});
it('failed cleanup keeps the parked path available and successful retry closes once', async () => {
  const run = { ...base, data: { stashPath: 'synthetic-owner/runs/run' } };
  cloud.remove.mockResolvedValueOnce({ error: { message: 'outage' } }).mockResolvedValueOnce({ error: null });
  cloud.update.mockResolvedValue({ error: null });
  await expect(closeRun(run, 'done')).rejects.toThrow('Retry cleanup');
  expect(cloud.patches[0]?.['data']).toMatchObject({ cleanupPending: 'done', stashPath: run.data.stashPath });
  await closeRun(run, 'done'); expect(cloud.update).toHaveBeenCalledTimes(3);
  expect(cloud.remove).toHaveBeenLastCalledWith(['synthetic-owner/runs/run']);
});
it('deleted original with lost final status leaves durable cleanup intent and retry needs no download', async () => {
  cloud.remove.mockResolvedValue({ error: null });
  cloud.update.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: 'lost final update' } });
  const run = { ...base, data: { stashPath: 'synthetic-owner/runs/run' } };
  await expect(closeRun(run, 'done')).rejects.toThrow('lost final update');
  expect(cloud.patches[0]?.['data']).toMatchObject({ cleanupPending: 'done' });
  cloud.update.mockResolvedValue({ error: null });
  await closeRun({ ...run, data: { ...run.data, cleanupPending: 'done' } }, 'done');
  expect(cloud.download).not.toHaveBeenCalled();
  expect(cloud.patches.at(-1)).toMatchObject({ status: 'done', data: { stashPath: undefined, cleanupPending: undefined } });
});