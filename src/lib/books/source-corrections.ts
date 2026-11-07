import type { DocField } from '../documents';
import type { ExtractedDocument } from '../document-extract.functions';
/** Only exact, unambiguous labels update typed proposals; unknown labels remain evidence details. */
const mappings: Record<string, { group: string; key: string; number?: boolean }> = {
  pan: { group: 'entity', key: 'pan' }, cin: { group: 'entity', key: 'cin' },
  'legal name': { group: 'entity', key: 'legalName' }, 'registered address': { group: 'entity', key: 'address' },
  'incorporation date': { group: 'entity', key: 'incorporatedOn' },
  'asset name': { group: 'asset', key: 'name' }, 'purchase cost': { group: 'asset', key: 'cost', number: true },
  'purchase date': { group: 'asset', key: 'purchaseDate' }, 'put to use date': { group: 'asset', key: 'putToUseOn' },
  'useful life': { group: 'asset', key: 'usefulLifeYears', number: true }, 'residual value percent': { group: 'asset', key: 'residualPct', number: true },
  'tenant': { group: 'lease', key: 'tenant' }, 'lease start': { group: 'lease', key: 'start' }, 'lease end': { group: 'lease', key: 'end' },
  'monthly rent': { group: 'lease', key: 'rent', number: true }, 'security deposit': { group: 'lease', key: 'deposit', number: true },
  'rent due day': { group: 'lease', key: 'dueDay', number: true }, 'payment terms': { group: 'lease', key: 'paymentTerms' },
  'notice period': { group: 'lease', key: 'noticeDays', number: true },
  'escalation percent': { group: 'lease', key: 'escalationPct', number: true },
  'escalation every months': { group: 'lease', key: 'escalationEveryMonths', number: true },
  'invoice number': { group: 'gstInvoice', key: 'number' }, 'taxable value': { group: 'gstInvoice', key: 'taxable', number: true },
  'igst': { group: 'gstInvoice', key: 'igst', number: true }, 'cgst': { group: 'gstInvoice', key: 'cgst', number: true }, 'sgst': { group: 'gstInvoice', key: 'sgst', number: true },
};
export function correctSourceField(read: ExtractedDocument, field: DocField, value: string): { read: ExtractedDocument; field: DocField; applied: boolean } {
  const corrected = { ...field, originalValue: field.originalValue ?? field.value, value, status: 'corrected' as const };
  const mapping = mappings[field.label.trim().toLowerCase()];
  if (!mapping) return { read, field: corrected, applied: false };
  const group = (read as unknown as Record<string, unknown>)[mapping.group];
  if (!group || typeof group !== 'object' || Array.isArray(group)) return { read, field: corrected, applied: false };
  let normalized: string | number | null = value.trim() || null;
  if (mapping.number && normalized != null) {
    const n = Number(value.replace(/,/g, ''));
    if (!Number.isFinite(n) || n < 0) throw new Error(`Enter a non-negative number for ${field.label}`);
    normalized = n;
  }
  return { read: { ...read, [mapping.group]: { ...group, [mapping.key]: normalized } } as ExtractedDocument, field: corrected, applied: true };
}