// Which record groups failed to load from the cloud on the last refresh (P0-004/P0-017).
// A failed read must never be shown as "no records": screens check these areas before showing an empty state.
export type LoadArea = 'transactions' | 'accounts' | 'payments' | 'loans' | 'settings' | 'budgets' | 'goals' | 'valuations' | 'documents' | 'family' | 'profile';

export const LOAD_AREA_LABEL: Record<LoadArea, string> = {
  transactions: 'transactions', accounts: 'accounts', payments: 'scheduled payments', loans: 'loans', settings: 'settings, trips and claims',
  budgets: 'budgets', goals: 'goals', valuations: 'valuations', documents: 'documents', family: 'family members', profile: 'profile',
};

/** Plain list for a message: "transactions, accounts and loans". */
export function loadAreaList(areas: readonly LoadArea[]): string {
  const names = [...new Set(areas)].map((a) => LOAD_AREA_LABEL[a]);
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** True when any of the given areas failed. */
export const loadFailed = (errors: readonly LoadArea[] | undefined, ...areas: LoadArea[]) => !!errors?.some((e) => areas.includes(e));
