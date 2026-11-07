/** Client-side orchestration; adapters must query under the current owner's access. */
export interface ReportSaveAdapter {
  upload: () => Promise<{ error: unknown }>;
  insert: () => Promise<{ error: unknown }>;
  read: () => Promise<{ data: { id: string; file_path: string | null; file_size: number | null; owner_id: string } | null; error: unknown }>;
}
export async function savePreparedReport(expected: { id: string; path: string; size: number; owner: string }, adapter: ReportSaveAdapter): Promise<void> {
  const matches = (row: Awaited<ReturnType<ReportSaveAdapter['read']>>['data']) => row?.id === expected.id && row.owner_id === expected.owner && row.file_path === expected.path && row.file_size === expected.size;
  const before = await adapter.read();
  if (before.error) throw Error('Could not check saved report. Keep this page open and retry saving.');
  if (before.data) {
    if (!matches(before.data)) throw Error('Saved report identity differs. No files were changed.');
    return;
  }
  const upload = await adapter.upload();
  if (upload.error) throw Error('PDF ready on this device; upload failed. Retry saving to history.');
  // A transport rejection can follow a committed insert just like an error response.
  // Read back either outcome before presenting the save as unconfirmed.
  let insert: { error: unknown };
  try { insert = await adapter.insert(); }
  catch (error) { insert = { error }; }
  if (!insert.error) return;
  const after = await adapter.read().catch(error => ({ data: null, error }));
  if (!after.error && matches(after.data)) return;
  // Never delete an object after an unknown database outcome: the row may exist.
  throw Error('PDF ready; history save could not be confirmed. Evidence retained. Retry saving.');
}