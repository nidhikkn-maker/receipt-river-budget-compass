/** Opens the shell's in-place Smart Add sheet from anywhere. `document` means a PDF is read as a statement/holding document without asking. */
export type SmartAddIntent = 'document';
export const SMART_ADD_EVENT = 'ledgerline:smart-add';
export const openSmartAdd = (intent?: SmartAddIntent) => window.dispatchEvent(new CustomEvent(SMART_ADD_EVENT, { detail: intent ? { intent } : {} }));
