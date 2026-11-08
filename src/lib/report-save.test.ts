import { expect, it, vi } from 'vitest';
import { savePreparedReport, type ReportSaveAdapter } from './report-save';
const expected = { id: 'report', owner: 'isolated', path: 'isolated/reports/report.pdf', size: 42 };
const row = { id: expected.id, owner_id: expected.owner, file_path: expected.path, file_size: expected.size };
it('requires exact persisted readback even after an acknowledged insert',async()=>{
 const adapter={read:vi.fn().mockResolvedValueOnce({data:null,error:null}).mockResolvedValueOnce({data:{...row,file_size:41},error:null}).mockResolvedValue({data:row,error:null}),upload:vi.fn().mockResolvedValue({error:null}),insert:vi.fn().mockResolvedValue({error:null})};
 await expect(savePreparedReport(expected,adapter)).rejects.toThrow('Evidence retained');
 await savePreparedReport(expected,adapter);
 expect(adapter.upload).toHaveBeenCalledTimes(1);expect(adapter.insert).toHaveBeenCalledTimes(1);
});
it('lost insert response reads back the identical owner report and never removes evidence', async () => {
  const read = vi.fn().mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: row, error: null }).mockResolvedValue({ data: row, error: null });
  const adapter = { read, upload: vi.fn().mockResolvedValue({ error: null }), insert: vi.fn().mockResolvedValue({ error: Error('Lost reply') }) };
  await savePreparedReport(expected, adapter);
  expect(adapter.upload).toHaveBeenCalledTimes(1);
  await savePreparedReport(expected, adapter);
  expect(adapter.insert).toHaveBeenCalledTimes(1);
});
it('unknown outcome retains uploaded bytes and a retry reuses the report identity', async () => {
  let stored = false;
  const adapter: ReportSaveAdapter = { read: vi.fn().mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: null, error: Error('Offline') }).mockResolvedValueOnce({ data: row, error: null }), upload: async () => { stored = true; return { error: null }; }, insert: vi.fn().mockResolvedValue({ error: Error('Timeout') }) };
  await expect(savePreparedReport(expected, adapter)).rejects.toThrow('Evidence retained');
  expect(stored).toBe(true);
  await savePreparedReport(expected, adapter);
  expect(adapter.insert).toHaveBeenCalledTimes(1);
});
it('failed upload never creates a history row, and mismatched identity never uploads', async () => {
  const adapter = { read: vi.fn().mockResolvedValue({ data: null, error: null }), upload: vi.fn().mockResolvedValue({ error: Error('Offline') }), insert: vi.fn() };
  await expect(savePreparedReport(expected, adapter)).rejects.toThrow('upload failed');
  expect(adapter.insert).not.toHaveBeenCalled();
  adapter.read.mockResolvedValue({ data: { ...row, owner_id: 'unrelated' }, error: null });
  await expect(savePreparedReport(expected, adapter)).rejects.toThrow('identity differs');
  expect(adapter.upload).toHaveBeenCalledTimes(1);
});
it('a rejected request after a committed insert recovers without duplicate upload or insert', async () => {
  const adapter = {
    read: vi.fn().mockResolvedValueOnce({ data: null, error: null }).mockResolvedValue({ data: row, error: null }),
    upload: vi.fn().mockResolvedValue({ error: null }),
    insert: vi.fn().mockRejectedValue(Error('Response interrupted after commit')),
  };
  await savePreparedReport(expected, adapter);
  await savePreparedReport(expected, adapter);
  expect(adapter.upload).toHaveBeenCalledTimes(1);
  expect(adapter.insert).toHaveBeenCalledTimes(1);
});
it('rejected insert and readback retain evidence and retry only the same identity', async () => {
  const adapter = {
    read: vi.fn().mockResolvedValueOnce({ data: null, error: null }).mockRejectedValueOnce(Error('Offline')).mockResolvedValue({ data: row, error: null }),
    upload: vi.fn().mockResolvedValue({ error: null }),
    insert: vi.fn().mockRejectedValue(Error('Lost response')),
  };
  await expect(savePreparedReport(expected, adapter)).rejects.toThrow('Evidence retained');
  await savePreparedReport(expected, adapter);
  expect(adapter.upload).toHaveBeenCalledTimes(1);
  expect(adapter.insert).toHaveBeenCalledTimes(1);
});