import { parseContext, type IntakeContext } from './books/intake';
/** Opens the existing review with its originating module, including scanned documents. */
export type SmartAddIntent = 'document' | IntakeContext;
export const smartAddContext = (intent?: SmartAddIntent): IntakeContext | undefined => intent === 'document' ? 'documents' : parseContext(intent);
export const SMART_ADD_EVENT = 'ledgerline:smart-add';
export const openSmartAdd = (intent?: SmartAddIntent) => window.dispatchEvent(new CustomEvent(SMART_ADD_EVENT, { detail: intent ? { intent } : {} }));
