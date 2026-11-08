/** Exact saved-record comparison context; never authorizes a write or a resolution. */
export interface ReconciliationInput {
  kind: 'invoice' | 'document' | 'entry' | 'holding' | 'opening';
  id: string;
  label: string;
  date: string | null;
  amount: number;
  documentIds: string[];
  sourceRefs: string[];
}
export interface ReconciliationContext {
  family: 'supplier' | 'customer' | 'loan' | 'investment' | 'intercompany';
  registration?: string;
  recordId: string;
  from: string;
  to: string;
  left: { label: string; amount: number; inputs: ReconciliationInput[] };
  right: { label: string; amount: number; inputs: ReconciliationInput[] };
  difference: number;
  unresolved: string[];
}
/** Hash is an exact finding selector, not navigation completion or permission. */
export const reconciliationAnchor = (key: string) => `comparison-${encodeURIComponent(key)}`;