import { isMissingFunction } from '../step-up';

/** Whether Statement Desk Undo can work on the connected database (P0-002). */
export type UndoCapability = 'available' | 'needs-update' | 'unknown';

export const UNDO_NEEDS_UPDATE = 'Undo for statement uploads needs an approved database update. Your saved records are unchanged. Meanwhile, correct individual entries from Review.';
export const UNDO_CHECK_FAILED = "Couldn't check whether Undo is available. Nothing was changed. Retry when connected.";

/** True when the database lacks a function or table the request named (PostgREST and Postgres codes). */
export function isMissingSchemaObject(e: unknown): boolean {
  if (isMissingFunction(e)) return true;
  if (!e || typeof e !== 'object') return false;
  const code = (e as { code?: unknown }).code;
  if (code === 'PGRST205' || code === '42P01') return true;
  const message = String((e as { message?: unknown }).message ?? '');
  return /could not find the table|relation .* does not exist/i.test(message);
}

/** Classifies the probe of the Undo receipts table: missing = needs the staged SQL; any other error = unknown. */
export function undoCapabilityFrom(error: unknown): UndoCapability {
  if (!error) return 'available';
  return isMissingSchemaObject(error) ? 'needs-update' : 'unknown';
}
