import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { atomicStatementUndo, statementUndoItems, undoReason, type StatementUndoReport } from './atomic-undo';
import { cleanStatementUploads } from '../preferences';
import { isMissingSchemaObject, undoCapabilityFrom, UNDO_NEEDS_UPDATE, type UndoCapability } from './undo-capability';

const input = z.object({
  id: z.string().uuid(),
  posted: z.array(z.string().uuid()).max(3000), reconciled: z.array(z.string().uuid()).max(3000),
  evidence: z.array(z.object({ id: z.string().uuid(), ref: z.string().max(1000) })).max(6000),
  expected: z.array(z.object({ id: z.string().uuid(), ref: z.string().nullable(), revision: z.number().int().nonnegative() })).max(3000),
});

/** Staged RPC boundary: missing authority refuses Undo, never falls back to sequential writes. */
export const undoStatement = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => input.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const saved = await supabase.from('finance_preferences').select('data').eq('owner_id', userId).maybeSingle();
    if (saved.error || !saved.data) throw Error('Upload history is unavailable. Recovery is retained.');
    const prefs = saved.data.data as { statementUploads?: unknown };
    const upload = cleanStatementUploads(prefs.statementUploads).find(u => u.id === data.id);
    if (!upload || JSON.stringify([...upload.posted].sort()) !== JSON.stringify([...data.posted].sort()) || JSON.stringify([...upload.reconciled].sort()) !== JSON.stringify([...data.reconciled].sort())) throw Error('Undo does not match the saved upload. Recovery is retained.');
    const readRows = async (ids: string[]) => {
      const all: Record<string, unknown>[] = [];
      for (let at = 0; at < ids.length; at += 100) {
        const result = await supabase.from('expenses').select('*').eq('employee_id', userId).in('id', ids.slice(at, at + 100));
        if (result.error) throw Error('Saved records could not be checked. Retry when connected.');
        all.push(...(result.data ?? []));
      }
      return all;
    };
    // Phase 3 (P7 r2) authority: every POSTED row is reversed (linked reversal entry, reason, correction
    // date today), unposted rows follow today's rule, matches are cleared; one transaction, replay by id.
    const p7 = supabase as unknown as {
      from: (table: 'statement_upload_reversals') => { select: (columns: string) => { eq: (column: string, value: string) => { eq: (column: string, value: string) => { maybeSingle: () => Promise<{ data: { id: string; result: StatementUndoReport } | null; error: { message: string; code?: string } | null }> } } } };
      rpc: (name: 'reverse_statement_upload', args: { _request: string; _upload: string; _items: unknown; _reason: string }) => Promise<{ data: StatementUndoReport | null; error: { message: string } | null }>;
    };
    const reversalReceipt = await p7.from('statement_upload_reversals').select('id,result').eq('owner_id', userId).eq('id', data.id).maybeSingle();
    if (!reversalReceipt.error) {
      let report: StatementUndoReport | null = reversalReceipt.data?.result ?? null;
      await atomicStatementUndo(data.id, upload, upload.undoRows ?? [], {
        receipt: async id => {
          const r = await p7.from('statement_upload_reversals').select('id,result').eq('owner_id', userId).eq('id', id).maybeSingle();
          if (r.error) throw Error('Saved records could not be checked. Nothing was changed; retry when connected.');
          if (r.data) report = r.data.result;
          return !!r.data;
        },
        rows: async ids => readRows(ids),
        commit: async (id, items) => {
          const result = await p7.rpc('reverse_statement_upload', { _request: id, _upload: data.id, _items: statementUndoItems(items), _reason: undoReason(upload.label) });
          if (result.error) throw Error(result.error.message);
          if (!result.data || result.data.request !== id) throw Error('Undo was not confirmed. Recovery history is retained; retry or review changed records.');
          report = result.data;
        },
      });
      return { ok: true, report };
    }
    if (!isMissingSchemaObject(reversalReceipt.error)) throw Error('Saved records could not be checked. Nothing was changed; retry when connected.');
    // Narrow typed boundary until the owner authorises installing the staged SQL/type refresh.
    const staged = supabase as unknown as {
      from: (table: 'statement_undo_receipts') => { select: (columns: string) => { eq: (column: string, value: string) => { eq: (column: string, value: string) => { maybeSingle: () => Promise<{ data: { id: string } | null; error: { message: string } | null }> } } } };
      rpc: (name: 'undo_statement_rows', args: { _id: string; _items: unknown }) => Promise<{ data: string | null; error: { message: string } | null }>;
    };
    await atomicStatementUndo(data.id, upload, upload.undoRows ?? [], {
      receipt: async id => {
        const result = await staged.from('statement_undo_receipts').select('id').eq('owner_id', userId).eq('id', id).maybeSingle();
        if (result.error) throw Error(isMissingSchemaObject(result.error) ? UNDO_NEEDS_UPDATE : 'Saved records could not be checked. Nothing was changed; retry when connected.');
        return !!result.data;
      },
      rows: async ids => readRows(ids),
      commit: async (id, items) => {
        const result = await staged.rpc('undo_statement_rows', { _id: id, _items: items });
        if (result.error && isMissingSchemaObject(result.error)) throw Error(UNDO_NEEDS_UPDATE);
        if (result.error || result.data !== id) throw Error('Undo was not confirmed. Recovery history is retained; retry or review changed records.');
      },
    });
    return { ok: true, report: null };
  });

/** Read-only probe so the Undo control reflects what the database can actually do (P0-002). */
export const statementUndoCapability = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ state: UndoCapability }> => {
    const { supabase, userId } = context;
    const staged = supabase as unknown as { from: (table: 'statement_undo_receipts' | 'statement_upload_reversals') => { select: (columns: string) => { eq: (column: string, value: string) => { limit: (n: number) => Promise<{ error: { message: string; code?: string } | null }> } } } };
    // P7 r2 (audited per-entry reversal) first; the older staged undo second.
    const p7 = await staged.from('statement_upload_reversals').select('id').eq('owner_id', userId).limit(1);
    if (!p7.error || !isMissingSchemaObject(p7.error)) return { state: undoCapabilityFrom(p7.error) };
    const probe = await staged.from('statement_undo_receipts').select('id').eq('owner_id', userId).limit(1);
    return { state: undoCapabilityFrom(probe.error) };
  });
