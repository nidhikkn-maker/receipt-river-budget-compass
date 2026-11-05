// Owner-scoped demat accounts and holdings in Lovable Cloud. RLS limits every read and write to the signed-in owner.
import { supabase } from "@/integrations/supabase/client";
import type { InvestDoc, InvestEvent, Lot, StoredHolding, GainLine } from "./demat";

export interface DematAccount { id: string; broker: string; dpId: string; clientId: string; holder: string }
export interface DematWithHoldings extends DematAccount { holdings: (StoredHolding & { id: string })[] }

export async function loadDemat(): Promise<DematWithHoldings[]> {
  const [a, h] = await Promise.all([
    supabase.from("demat_accounts").select("*").order("created_at"),
    supabase.from("security_holdings").select("*").order("name"),
  ]);
  if (a.error) throw new Error(a.error.message);
  if (h.error) throw new Error(h.error.message);
  return (a.data ?? []).map((d) => ({
    id: d.id, broker: d.broker, dpId: d.dp_id, clientId: d.client_id, holder: d.holder,
    holdings: (h.data ?? []).filter((x) => x.demat_id === d.id).map((x) => ({
      id: x.id, isin: x.isin, name: x.name, quantity: Number(x.quantity), asOf: x.as_of, statementValue: x.statement_value == null ? null : Number(x.statement_value),
      lots: (x.lots ?? []) as unknown as Lot[], gains: (x.gains ?? []) as unknown as (GainLine & { source: string })[], sources: (x.sources ?? []) as unknown as string[],
      events: (x.events ?? []) as unknown as (InvestEvent & { source: string })[],
    })),
  }));
}

/** Finds the demat account a document belongs to by its printed DP/client IDs; never by holder name alone. */
export function matchDemat(accounts: DematAccount[], doc: Pick<InvestDoc, "dpId" | "clientId">): DematAccount | null {
  if (!doc.dpId && !doc.clientId) return null;
  return accounts.find((a) => (doc.clientId && a.clientId === doc.clientId && (!doc.dpId || !a.dpId || a.dpId === doc.dpId)) || (!doc.clientId && doc.dpId && a.dpId === doc.dpId)) ?? null;
}

export async function createDemat(doc: InvestDoc): Promise<string> {
  const { data, error } = await supabase.from("demat_accounts").insert({ broker: doc.broker, dp_id: doc.dpId, client_id: doc.clientId, holder: doc.holder }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}

/** Writes merged holdings with one row per ISIN (unique in the database), so a security can never appear twice. */
export async function saveHoldings(dematId: string, holdings: StoredHolding[]) {
  if (!holdings.length) return;
  const owner = (await supabase.auth.getSession()).data.session?.user.id;
  if (!owner) throw new Error("Sign in again to save holdings");
  const { error } = await supabase.from("security_holdings").upsert(holdings.map((h) => ({
    owner_id: owner, demat_id: dematId, isin: h.isin, name: h.name, quantity: h.quantity, as_of: h.asOf, statement_value: h.statementValue,
    lots: h.lots as never, gains: h.gains as never, sources: h.sources as never, events: (h.events ?? []) as never, updated_at: new Date().toISOString(),
  })), { onConflict: "owner_id,demat_id,isin" });
  if (error) throw new Error(error.message);
}

/** Undo: put back the earlier rows and remove ISINs the upload introduced. */
export async function restoreHoldings(dematId: string, before: StoredHolding[], after: StoredHolding[]) {
  const gone = after.filter((a) => !before.some((b) => b.isin === a.isin)).map((a) => a.isin);
  if (gone.length) { const { error } = await supabase.from("security_holdings").delete().eq("demat_id", dematId).in("isin", gone); if (error) throw new Error(error.message); }
  await saveHoldings(dematId, before);
}
