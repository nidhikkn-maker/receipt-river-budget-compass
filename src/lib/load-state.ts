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

// R14: one status per record area, in priority order. Screens map them to the shared States:
//  loading -> LoadingState · offline -> OfflineState (cached values, never "fresh") ·
//  unavailable -> OfflineUnavailableState (offline and this area was never read on this device: no figures, no
//  EmptyState, no "Not linked", no ₹0.00 — there are no values to show, not zero values) · denied -> UnauthorizedState ·
//  failed -> ErrorState with Retry · empty -> EmptyState · ready -> the records.
// `hasData` is the store's per-area signal: true once the area holds values from the encrypted device copy or a cloud read
// that succeeded on this device; a denial clears it (the area leaves memory). Offline needs it: without it "offline"
// would present never-loaded, empty arrays as cached data.
// A denied area never reads as empty or ready: its last-known values (device copy / earlier load) stay in memory only as
// flagged, so screens must not present them as current. Offline wins over denied (no check is possible offline); the
// status stays 'offline' with a note that the last online check was refused, and the screen shows the note, no records.
export type AreaStatus = 'loading' | 'offline' | 'unavailable' | 'denied' | 'failed' | 'empty' | 'ready';
export interface AreaStatusInfo { status: AreaStatus; note: string | null }
export const DENIED_OFFLINE_NOTE = "Your access was refused at the last online check. Reconnect to check again; nothing shown here is current.";

export function areaStatus(i: {
  settled: boolean; online: boolean; errors: readonly LoadArea[] | undefined; denied: readonly LoadArea[] | undefined; empty: boolean;
  /** Values from the device copy or a successful read are in memory for this area (store.tsx loadedAreas). */
  hasData: boolean;
}, area: LoadArea): AreaStatusInfo {
  const wasDenied = !!i.denied?.includes(area);
  if (!i.online) {
    if (wasDenied) return { status: 'offline', note: DENIED_OFFLINE_NOTE };
    return { status: i.hasData ? 'offline' : 'unavailable', note: null };
  }
  if (wasDenied) return { status: 'denied', note: null };
  if (i.errors?.includes(area)) return { status: 'failed', note: null };
  if (!i.settled) return { status: 'loading', note: null };
  return { status: i.empty ? 'empty' : 'ready', note: null };
}

/** True only for statuses whose in-memory values may be shown (ready / empty, or offline cached values without a denial note). */
export const areaShowsValues = (s: AreaStatusInfo) => s.status === 'ready' || s.status === 'empty' || (s.status === 'offline' && !s.note);

// R14: areas denied on the last online check, remembered per owner on this device so the encrypted device copy is not
// painted for them on the next start (offline included) until a read of that area succeeds again. Only area names are
// stored, never records; unavailable storage simply means nothing is remembered (the cloud check still runs).
export const ALL_LOAD_AREAS: readonly LoadArea[] = ['transactions', 'accounts', 'payments', 'loans', 'settings', 'budgets', 'goals', 'valuations', 'documents', 'family', 'profile'];
const deniedKey = (owner: string) => `ledgerline.deniedAreas.${owner}`;
export function readDeniedMarker(owner: string): LoadArea[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(deniedKey(owner)) ?? '[]');
    return Array.isArray(v) ? ALL_LOAD_AREAS.filter((a) => v.includes(a)) : [];
  } catch { return []; }
}
export function writeDeniedMarker(owner: string, areas: readonly LoadArea[]): void {
  try { if (areas.length) localStorage.setItem(deniedKey(owner), JSON.stringify([...new Set(areas)])); else localStorage.removeItem(deniedKey(owner)); } catch { /* nothing remembered */ }
}
