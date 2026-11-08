/** Opens in-place review; explicit document/asset entry points also accept scanned photos. */
export type SmartAddIntent = 'document' | 'assets';
export const SMART_ADD_EVENT = 'ledgerline:smart-add';
export const openSmartAdd = (intent?: SmartAddIntent) => window.dispatchEvent(new CustomEvent(SMART_ADD_EVENT, { detail: intent ? { intent } : {} }));
