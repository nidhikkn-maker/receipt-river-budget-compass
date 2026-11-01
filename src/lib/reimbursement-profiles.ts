import type { Claimant } from './expense-claim';
import type { Expense, Scope } from './expenses';
import type { Account } from './ledger';
import type { Statement } from './expenditure-statement';

export const DEFAULT_DECLARATION = 'I certify that these expenses were incurred for the stated official purpose, paid personally, and have not been claimed or reimbursed elsewhere. Supporting documents are attached where available.';
export interface ApprovalRoute { id: string; label: string; reportingAuthority: string; approver: string; finance: string; additionalApprover: string; designation: string }
export interface ReimbursementProfile {
  id: string; organisation: string; workspace: Scope; organisationCode: string; costCentre: string;
  name: string; designation: string; employeeId: string; department: string; email: string; contact: string;
  accountId: string; accountHolder: string; currency: string; format: 'detailed' | 'summary'; declaration: string;
  documentRule: 'warn' | 'required'; categories: string[]; routes: ApprovalRoute[]; defaultRouteId: string; isDefault: boolean;
}
export interface ActivityProfileMapping { activity: string; organisation: string; profileId: string }
export interface Responsibility { entryId: string; shares: { organisation: string; amount: number }[] }
export interface ReimbursementSettings { profiles: ReimbursementProfile[]; mappings: ActivityProfileMapping[]; responsibilities: Responsibility[]; lastFormat: 'detailed' | 'summary' }
export const emptyReimbursementSettings = (): ReimbursementSettings => ({ profiles: [], mappings: [], responsibilities: [], lastFormat: 'detailed' });
export function cleanReimbursementSettings(raw?: Partial<ReimbursementSettings> | null): ReimbursementSettings {
  return { profiles: Array.isArray(raw?.profiles) ? raw.profiles.filter(p => p && typeof p.id === 'string' && typeof p.organisation === 'string') : [], mappings: Array.isArray(raw?.mappings) ? raw.mappings.filter(m => m && typeof m.activity === 'string' && typeof m.profileId === 'string') : [], responsibilities: Array.isArray(raw?.responsibilities) ? raw.responsibilities.filter(r => r && typeof r.entryId === 'string' && Array.isArray(r.shares)) : [], lastFormat: raw?.lastFormat === 'summary' ? 'summary' : 'detailed' };
}
export function newReimbursementProfile(name = ''): ReimbursementProfile {
  return { id: crypto.randomUUID(), organisation: '', workspace: 'business', organisationCode: '', costCentre: '', name, designation: '', employeeId: '', department: '', email: '', contact: '', accountId: '', accountHolder: '', currency: 'INR', format: 'detailed', declaration: DEFAULT_DECLARATION, documentRule: 'warn', categories: [], routes: [], defaultRouteId: '', isDefault: false };
}
export const maskedText = (text: string) => text.replace(/(?:\d[ -]?){5,}/g, match => `••••${match.replace(/\D/g, '').slice(-4)}`);
export const reimbursementAccountLabel = (account?: Account) => account ? `${maskedText(account.name)}${account.lastFour ? ` ••••${account.lastFour.replace(/\D/g, '').slice(-4)}` : ''}` : 'Account not selected';
export function profileClaimant(p: ReimbursementProfile, accounts: Account[], routeId?: string): Claimant {
  const route = p.routes.find(r => r.id === (routeId || p.defaultRouteId));
  return { name: p.name, designation: p.designation, department: p.department, employeeId: p.employeeId, email: p.email, approver: route?.approver ?? '', bankDetails: p.accountId ? `${reimbursementAccountLabel(accounts.find(a => a.id === p.accountId))}${p.accountHolder ? ` · ${maskedText(p.accountHolder)}` : ''}` : '', declaration: p.declaration, reportingAuthority: route?.reportingAuthority ?? '', finance: route?.finance ?? '', additionalApprover: route?.additionalApprover ?? '', approvalDesignation: route?.designation ?? '', costCentre: p.costCentre, organisationCode: p.organisationCode, preferredCurrency: p.currency };
}
export function saveProfile(settings: ReimbursementSettings, profile: ReimbursementProfile, organisations: string[], accounts: Account[]): ReimbursementSettings {
  if (!organisations.includes(profile.organisation)) throw Error('Choose a saved organisation.');
  if (!profile.name.trim() || !profile.designation.trim()) throw Error('Enter claimant name and role.');
  if (profile.accountId && !accounts.some(a => a.id === profile.accountId && !a.archived && ['savings', 'current', 'wallet'].includes(a.kind))) throw Error('Choose an active receiving account.');
  if (!/^[A-Z]{3}$/.test(profile.currency)) throw Error('Choose a three-letter currency.');
  if (settings.profiles.some(p => p.id !== profile.id && p.organisation === profile.organisation && p.designation.trim().toLowerCase() === profile.designation.trim().toLowerCase())) throw Error('This organisation and role already have a profile.');
  return { ...settings, profiles: [...settings.profiles.filter(p => p.id !== profile.id).map(p => profile.isDefault && p.organisation === profile.organisation ? { ...p, isDefault: false } : p), profile] };
}
export function resolveReimbursementProfile(settings: ReimbursementSettings, input: { organisation: string; activity: string; explicitId?: string; workspace?: Scope; role?: string }) {
  const profiles = settings.profiles.filter(p => p.organisation === input.organisation && (!input.workspace || p.workspace === input.workspace) && (!input.role || p.designation === input.role));
  const explicit = input.explicitId ? profiles.find(p => p.id === input.explicitId) : undefined;
  if (input.explicitId) return { profile: explicit, reason: explicit ? 'Selected for this claim' : 'Selected profile is no longer applicable' };
  const mapped = settings.mappings.find(m => m.activity === input.activity && m.organisation === input.organisation);
  if (mapped) return { profile: profiles.find(p => p.id === mapped.profileId), reason: 'Assigned to this activity' };
  if (profiles.length === 1) return { profile: profiles[0], reason: 'Unique applicable profile' };
  const defaults = profiles.filter(p => p.isDefault);
  if (defaults.length === 1) return { profile: defaults[0], reason: 'Organisation default' };
  return { profile: undefined, reason: profiles.length ? 'Choose the applicable role' : 'No applicable profile configured' };
}
export function responsibilityShares(e: Expense, settings: ReimbursementSettings, fallback = '') {
  const saved = settings.responsibilities.find(r => r.entryId === e.id);
  if (saved) {
    const total = saved.shares.reduce((s, p) => s + p.amount, 0);
    if (Math.abs(total - e.amount) > .009 || saved.shares.some(p => !p.organisation || !Number.isFinite(p.amount) || p.amount <= 0) || new Set(saved.shares.map(p => p.organisation)).size !== saved.shares.length) return [];
    return saved.shares;
  }
  if (e.allocations?.length && e.allocations.every(a => (a.tags ?? []).filter(t => t.startsWith('Organisation: ')).length === 1) && Math.abs(e.allocations.reduce((s, a) => s + a.amount, 0) - e.amount) < .009) {
    const totals = new Map<string, number>();
    for (const a of e.allocations) { const org = a.tags?.find(t => t.startsWith('Organisation: '))?.slice(14).trim(); if (org) totals.set(org, (totals.get(org) ?? 0) + a.amount); }
    return [...totals].map(([organisation, amount]) => ({ organisation, amount }));
  }
  const tags = [...new Set((e.tags ?? []).filter(t => t.startsWith('Organisation: ')).map(t => t.slice(14).trim()).filter(Boolean))];
  const payer = e.reimbursement?.payer?.trim();
  // A saved payable-to organisation is authoritative; conflicting multiple tags remain unresolved.
  const organisation = payer || (tags.length === 1 ? tags[0] : tags.length > 1 ? '' : e.department?.trim() || fallback);
  return organisation ? [{ organisation, amount: e.amount }] : [];
}
export function validateResponsibility(shares: Responsibility['shares'], amount: number) {
  if (!shares.length || shares.some(p => !p.organisation || !Number.isFinite(p.amount) || p.amount <= 0 || Math.round(p.amount * 100) / 100 !== p.amount) || new Set(shares.map(p => p.organisation)).size !== shares.length || Math.abs(shares.reduce((s, p) => s + p.amount, 0) - amount) > .009) throw Error('Organisation shares must be positive and total the original stored INR amount.');
}
/** Report-only proportional attribution. Original records and exchange rates remain untouched. */
export function organisationStatement(statement: Statement, entries: Expense[], settings: ReimbursementSettings, organisation: string, fallback = ''): Statement {
  const rows = statement.rows.map(row => {
    const entry = entries.find(e => e.id === row.id);
    const parts = entry ? responsibilityShares(entry, settings, fallback) : [];
    const share = parts.find(p => p.organisation === organisation);
    const ratio = entry && share && entry.amount > 0 ? share.amount / entry.amount : 0;
    const round = (n: number) => Math.round(n * 100) / 100;
    // Round with a stable remainder so separate organisation claims reconcile exactly.
    const apportioned = (n: number) => {
      if (!share || !entry || entry.amount <= 0) return 0;
      const before = parts.slice(0, -1).reduce((s, p) => s + round(n * p.amount / entry.amount), 0);
      return parts.at(-1)?.organisation === organisation ? round(n - before) : round(n * ratio);
    };
    const eligible = apportioned(row.eligible), reimbursed = apportioned(row.reimbursed);
    const outstanding = row.outstanding > 0 ? round(Math.max(0, eligible - reimbursed)) : 0;
    const unknown = !parts.length;
    return { ...row, allocated: apportioned(row.inr), eligible, reimbursed, outstanding, rejected: apportioned(row.rejected), status: unknown ? 'Organisation requires review' : !share ? 'Other organisation' : row.status };
  });
  return { ...statement, organisation, rows };
}