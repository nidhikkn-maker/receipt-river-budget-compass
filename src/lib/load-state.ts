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

// R14: a read refused for permission (RLS / grant 42501, HTTP 401/403, an expired or rejected token, or a locked
// session) is not "no records" and not an ordinary outage either: screens show UnauthorizedState for it. Denied areas
// are also listed in loadErrors, so every screen that already refuses to show a failed read as empty stays correct.
export type LoadErrorKind = 'failed' | 'denied';
export type AreaReadState = 'ok' | LoadErrorKind;

type ReadError = { code?: unknown; status?: unknown; message?: unknown } | null | undefined;
const DENIED_CODES = new Set(['42501', 'PGRST301', 'PGRST302', 'PGRST303', 'SESSION_LOCKED', '401', '403']);

/** True when a Supabase read error (or its HTTP status) means "not allowed", not "could not load". */
export function isDeniedRead(error: ReadError, status?: number | null): boolean {
  if (!error) return false;
  if (status === 401 || status === 403 || error.status === 401 || error.status === 403) return true;
  if (DENIED_CODES.has(String(error.code ?? ''))) return true;
  return /permission denied|row-level security|not authori[sz]ed|SESSION_LOCKED/i.test(String(error.message ?? ''));
}

/** 'denied' if any area was refused, else 'failed' if any failed, else 'ok' (denied wins: it needs a different screen). */
export function areaReadState(errors: readonly LoadArea[] | undefined, denied: readonly LoadArea[] | undefined, ...areas: LoadArea[]): AreaReadState {
  if (denied?.some((a) => areas.includes(a))) return 'denied';
  return loadFailed(errors, ...areas) ? 'failed' : 'ok';
}
