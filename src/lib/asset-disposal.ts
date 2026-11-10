// P0-015 (KK, binding): "Asset disposal requires owner or explicitly authorised financial approval, with source evidence,
// reason, disposal date, proceeds, accounting entries and audit trail. Archiving never constitutes disposal."
// Server-side disposal approval over the proposed P14 database functions. The book value and gain/loss are worked out here,
// on the server, from the stored register with the app's own rules (assets-ledger.ts applyEvent → disposalResult →
// eventPostings, ownerPostingId(disposalKey)); the database checks who may request/approve, the evidence, the reason, the
// asset state, records everything and, on approval, writes the asset's disposal and the non-cash disposal entry in one
// transaction (P7/P8 then post it as a balanced batch). Contract for the I05 screen: docs/workstreams/contracts/disposal-approval.md.
import type { Asset } from "./assets";
import type { ClosedPeriod } from "./books/types";
import { applyEvent, disposalKey, disposalResult, eventPostings, ownerPostingId } from "./books/assets-ledger";
import { isMissingFunction } from "./step-up";

export const DISPOSAL_METHODS = ["sale", "scrap", "write_off", "donation", "lost"] as const;
export type DisposalMethod = (typeof DISPOSAL_METHODS)[number];
export interface DisposalInput { assetId: string; method: DisposalMethod; date: string; proceeds: number; proceedsEntryId?: string | null | undefined; evidence: string[]; reason: string }
export interface DisposalPlan { bookValue: number; proceeds: number; gain: number; problems: string[] }

const r2 = (n: number) => Math.round(n * 100) / 100;
/** Book value at the disposal date, gain or loss, and why it cannot be posted (closed period, no ledger account). Pure. */
export function disposalPlan(asset: Asset, input: Pick<DisposalInput, "date" | "proceeds">, closed: ClosedPeriod[]): DisposalPlan {
  const disposed = applyEvent({ ...asset, soldOn: undefined }, { id: "plan", assetId: asset.id, date: input.date, kind: "disposal", note: "", value: input.proceeds });
  const d = disposalResult(disposed);
  const problems = eventPostings(disposed, closed).problems;
  const bookValue = d ? r2(d.nbv) : r2(asset.cost);
  if (!Number.isFinite(bookValue)) problems.push(`${asset.name}: book value could not be worked out`);
  return { bookValue, proceeds: r2(input.proceeds), gain: r2(input.proceeds - bookValue), problems };
}

interface Res { data: unknown; error: { message: string; code?: string } | null }
interface Q extends PromiseLike<Res> { select(c: string): Q; eq(k: string, v: unknown): Q; maybeSingle(): PromiseLike<Res> }
export interface DisposalDb { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<Res>; from: (table: string) => Q }
export const DISPOSAL_NOT_INSTALLED = "Asset disposal approval needs an approved database update (P14). Nothing was changed.";
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const fail = (e: { message: string; code?: string }): never => { throw Error(isMissingFunction(e) ? DISPOSAL_NOT_INSTALLED : e.message); };

/** The owner asks for a disposal; the server prices it from the stored register. Returns the request id and the plan. */
export async function requestDisposal(db: DisposalDb, owner: string, input: DisposalInput): Promise<{ requestId: string; plan: DisposalPlan; entryId: string }> {
  const prefs = await db.from("finance_preferences").select("data").eq("owner_id", owner).maybeSingle();
  if (prefs.error) throw Error("Couldn't read the asset register. Nothing was changed; try again.");
  const data = isObj(prefs.data) && isObj(prefs.data["data"]) ? prefs.data["data"] : {};
  const asset = (Array.isArray(data["assets"]) ? data["assets"] : []).find((a): a is Asset => isObj(a) && a["id"] === input.assetId);
  if (!asset) throw Error("P14_NOT_FOUND: that asset is not in your register");
  const closed = (isObj(data["books"]) && Array.isArray(data["books"]["closedPeriods"]) ? data["books"]["closedPeriods"] : []) as ClosedPeriod[];
  const plan = disposalPlan(asset, input, closed);
  if (plan.problems.length) throw Error(`P14_INVALID: ${plan.problems.join("; ")}`);
  const entryId = await ownerPostingId(owner, disposalKey(asset.id, input.date));
  const r = await db.rpc("request_asset_disposal", {
    p_asset: asset.id, p_method: input.method, p_date: input.date, p_proceeds: plan.proceeds, p_proceeds_entry: input.proceedsEntryId ?? null,
    p_evidence: input.evidence, p_reason: input.reason, p_book_value: plan.bookValue, p_entry: entryId,
    p_inputs: { rule: "assets-ledger.disposalResult", closedPeriods: closed, gain: plan.gain },
  });
  if (r.error) fail(r.error);
  return { requestId: String(r.data), plan, entryId };
}

export interface DisposalPreviewEntry {
  id: string; title: string; date: string; amount: number; accountId: string | null; category: "Asset disposal"; txnType: "adjustment"; adjustmentSign: -1;
  /** Where books are active (P7/P8) the entry posts this balanced batch. */
  lines: { code: string; debit: number; credit: number }[];
}
export interface DisposalPreview extends DisposalPlan {
  entryId: string;
  entries: DisposalPreviewEntry[];
  /** The database's own working (P14-a): its book value, the tolerance it allows the app's paise figure, its problems. */
  database: { bookValue: number | null; tolerance: number | null; problems: string[] } | null;
}

/**
 * R-E-I14: read-only preview of what a request would record — the server's book value, gain or loss, the non-cash disposal
 * entry and its posting — plus the database's own check. Reads only (the database preview is a STABLE function); nothing
 * is requested, written or reserved.
 */
export async function previewDisposal(db: DisposalDb, owner: string, input: Pick<DisposalInput, "assetId" | "date" | "proceeds">): Promise<DisposalPreview> {
  const prefs = await db.from("finance_preferences").select("data").eq("owner_id", owner).maybeSingle();
  if (prefs.error) throw Error("Couldn't read the asset register. Nothing was changed; try again.");
  const data = isObj(prefs.data) && isObj(prefs.data["data"]) ? prefs.data["data"] : {};
  const asset = (Array.isArray(data["assets"]) ? data["assets"] : []).find((a): a is Asset => isObj(a) && a["id"] === input.assetId);
  if (!asset) throw Error("P14_NOT_FOUND: that asset is not in your register");
  const closed = (isObj(data["books"]) && Array.isArray(data["books"]["closedPeriods"]) ? data["books"]["closedPeriods"] : []) as ClosedPeriod[];
  const plan = disposalPlan(asset, input, closed);
  const entryId = await ownerPostingId(owner, disposalKey(asset.id, input.date));
  const accountId = asset.accountId ?? null;
  const entries: DisposalPreviewEntry[] = plan.bookValue > 0 ? [{
    id: entryId, title: `Disposal · ${asset.name}`, date: input.date, amount: plan.bookValue, accountId, category: "Asset disposal", txnType: "adjustment", adjustmentSign: -1,
    lines: [{ code: "expense:Loss on asset disposal (book value)", debit: plan.bookValue, credit: 0 }, { code: `account:${accountId ?? "(link a ledger asset account)"}`, debit: 0, credit: plan.bookValue }],
  }] : [];
  const r = await db.rpc("preview_asset_disposal", { p_asset: asset.id, p_date: input.date, p_proceeds: plan.proceeds });
  let database: DisposalPreview["database"] = null;
  const problems = [...plan.problems];
  if (r.error) { if (!isMissingFunction(r.error)) throw Error(r.error.message); problems.push(DISPOSAL_NOT_INSTALLED); }
  else {
    const d = (isObj(r.data) ? r.data : {}) as { bookValue?: number | null; tolerance?: number | null; problems?: string[] };
    database = { bookValue: d.bookValue == null ? null : Number(d.bookValue), tolerance: d.tolerance == null ? null : Number(d.tolerance), problems: Array.isArray(d.problems) ? d.problems.map(String) : [] };
    problems.push(...database.problems.filter((p) => !problems.includes(p)));
    if (database.bookValue != null && database.tolerance != null && Math.abs(database.bookValue - plan.bookValue) > database.tolerance) {
      problems.push(`The database works out a book value of ${database.bookValue.toFixed(2)}, not ${plan.bookValue.toFixed(2)}; the request would be refused`);
    }
  }
  return { ...plan, problems, entryId, entries, database };
}

/** The owner (step-up where installed) or a Finance approver for that company decides; the server re-prices the stored snapshot. */
export async function decideDisposal(db: DisposalDb, input: { requestId: string; approve: boolean; reason: string }): Promise<{ status: string; entry: string | null; replayed: boolean }> {
  const q = await db.from("asset_disposal_requests").select("*").eq("id", input.requestId).maybeSingle();
  if (q.error) { if (/does not exist|could not find the table/i.test(q.error.message)) throw Error(DISPOSAL_NOT_INSTALLED); throw Error("Couldn't read the disposal request. Nothing was changed; try again."); }
  if (!isObj(q.data)) throw Error("P14_NOT_PERMITTED: only the owner or a Finance approver for that company decides a disposal");
  const req = q.data;
  let bookValue: number | null = null;
  if (input.approve) {
    const inputs = isObj(req["inputs"]) ? req["inputs"] : {};
    const asset = inputs["asset"] as Asset | undefined;
    if (!asset) throw Error("P14_CHANGED: the request has no register snapshot; prepare a new request");
    const plan = disposalPlan(asset, { date: String(req["disposal_date"]), proceeds: Number(req["proceeds"]) }, (Array.isArray(inputs["closedPeriods"]) ? inputs["closedPeriods"] : []) as ClosedPeriod[]);
    if (plan.problems.length) throw Error(`P14_INVALID: ${plan.problems.join("; ")}`);
    bookValue = plan.bookValue;
  }
  const r = await db.rpc("decide_asset_disposal", { p_request: input.requestId, p_approve: input.approve, p_reason: input.reason, p_book_value: bookValue });
  if (r.error) fail(r.error);
  const d = (isObj(r.data) ? r.data : {}) as { status?: string; entry?: string | null; replayed?: boolean };
  return { status: String(d.status), entry: d.entry ?? null, replayed: !!d.replayed };
}

export async function cancelDisposal(db: DisposalDb, input: { requestId: string; reason: string }): Promise<{ status: string; replayed: boolean }> {
  const r = await db.rpc("cancel_asset_disposal", { p_request: input.requestId, p_reason: input.reason });
  if (r.error) fail(r.error);
  const d = (isObj(r.data) ? r.data : {}) as { status?: string; replayed?: boolean };
  return { status: String(d.status), replayed: !!d.replayed };
}

/** Plain wording for the database's refusal codes (the screen shows these). */
export function disposalProblem(message: string): string {
  const code = /^(P14_[A-Z_]+|STEP_UP_REQUIRED):/.exec(message)?.[1];
  const rest = message.replace(/^[A-Z0-9_]+: /, "");
  return ({
    P14_NOT_PERMITTED: "Only the owner, or a Finance approver for that company who did not ask, decides a disposal.",
    P14_EVIDENCE: "Attach the disposal evidence (sale invoice, scrap note or write-off approval) from your documents.",
    P14_REASON: "Give a reason of at least 5 characters.",
    P14_PENDING: "This asset already has an open disposal request.",
    P14_CHANGED: "The asset or its book value changed since the request. Prepare a new request.",
    P14_ALREADY_DISPOSED: rest.replace(/^./, (c) => c.toUpperCase()),
    P14_DISPOSAL_APPROVAL_REQUIRED: "Assets are disposed only through an approved disposal request. Archiving never disposes an asset.",
    STEP_UP_REQUIRED: "Confirm it's you to approve this disposal.",
    P14_STEP_UP_UNAVAILABLE: "Approving a disposal needs the identity check (step-up), which isn't set up yet. Nothing was changed.",
    P14_BOOK_VALUE: "The book value doesn't follow from the asset register. Nothing was changed; prepare the request again.",
    P14_UNVERIFIABLE: `The book value of this asset can't be checked yet (${rest.replace(/^the database cannot check this asset's book value \((.*)\).*$/, "$1")}). Nothing was changed.`,
  } as Record<string, string>)[code ?? ""] ?? rest;
}
