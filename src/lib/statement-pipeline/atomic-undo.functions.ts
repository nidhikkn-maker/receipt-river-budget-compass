import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { atomicStatementUndo } from './atomic-undo';
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
      rows: async ids => {
        const all: Record<string, unknown>[] = [];
        for (let at = 0; at < ids.length; at += 100) {
          const result = await supabase.from('expenses').select('*').eq('employee_id', userId).in('id', ids.slice(at, at + 100));
          if (result.error) throw Error('Saved records could not be checked. Retry when connected.');
          all.push(...(result.data ?? []));
        }
        return all;
      },
      commit: async (id, items) => {
        const result = await staged.rpc('undo_statement_rows', { _id: id, _items: items });
        if (result.error && isMissingSchemaObject(result.error)) throw Error(UNDO_NEEDS_UPDATE);
        if (result.error || result.data !== id) throw Error('Undo was not confirmed. Recovery history is retained; retry or review changed records.');
      },
    });
    return { ok: true };
  });

/** Read-only probe so the Undo control reflects what the database can actually do (P0-002). */
export const statementUndoCapability = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ state: UndoCapability }> => {
    const { supabase, userId } = context;
    const staged = supabase as unknown as { from: (table: 'statement_undo_receipts') => { select: (columns: string) => { eq: (column: string, value: string) => { limit: (n: number) => Promise<{ error: { message: string; code?: string } | null }> } } } };
    const probe = await staged.from('statement_undo_receipts').select('id').eq('owner_id', userId).limit(1);
    return { state: undoCapabilityFrom(probe.error) };
  });
