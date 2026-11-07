import { useState } from "react";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Pencil, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ACCOUNT_LABEL } from "@/lib/ledger";
import { money } from "@/lib/expenses";
import { useStore } from "@/lib/store";
import {
  INSTRUMENT_ACCOUNT_KINDS, INSTRUMENT_LABEL, INSTRUMENT_TYPES, instrumentLabel, totalsByInstrument, upsertInstrument, usesLastFour, usesUpiHandle,
  type InstrumentType, type PaymentInstrument,
} from "@/lib/payment-instruments";

const blank = (accountId = ""): PaymentInstrument => ({ id: "", type: "upi", nickname: "", handle: "", lastFour: "", accountId, memberId: null, parentId: null });

/** Add/edit/archive saved payment methods. `accountId` limits the list to one account. */
export function PaymentMethodsManager({ accountId }: { accountId?: string }) {
  const { preferences, savePreferences, accounts, members, expenses } = useStore();
  const all = preferences.paymentInstruments;
  const list = accountId ? all.filter((p) => p.accountId === accountId) : all;
  const [draft, setDraft] = useState<PaymentInstrument | null>(null);
  const [busy, setBusy] = useState(false);
  const totals = totalsByInstrument(expenses);
  const allowed = draft ? accounts.filter((a) => !a.archived && INSTRUMENT_ACCOUNT_KINDS[draft.type].includes(a.kind) && (!accountId || a.id === accountId)) : [];

  const persist = async (next: PaymentInstrument[], msg: string) => {
    setBusy(true);
    try { await savePreferences({ ...preferences, paymentInstruments: next }); toast.success(msg); return true; }
    catch (e) { toast.error((e as Error).message); return false; }
    finally { setBusy(false); }
  };
  const submit = async () => {
    if (!draft) return;
    try {
      const next = upsertInstrument(all, { ...draft, id: draft.id || crypto.randomUUID() }, accounts);
      if (await persist(next, draft.id ? "Payment method updated" : "Payment method added")) setDraft(null);
    } catch (e) { toast.error((e as Error).message); }
  };
  const setType = (t: InstrumentType) => {
    if (!draft) return;
    const keep = accounts.find((a) => a.id === draft.accountId && INSTRUMENT_ACCOUNT_KINDS[t].includes(a.kind));
    setDraft({ ...draft, type: t, accountId: keep?.id ?? (accountId && accounts.some((a) => a.id === accountId && INSTRUMENT_ACCOUNT_KINDS[t].includes(a.kind)) ? accountId : "") });
  };
  const mainCards = all.filter((p) => !p.archived && p.id !== draft?.id && ["credit_card", "debit_card"].includes(p.type));

  return (
    <div className="grid gap-3">
      {list.length === 0 && !draft && <p className="text-sm text-muted-foreground">No payment methods saved yet.</p>}
      {list.map((p) => {
        const acc = accounts.find((a) => a.id === p.accountId);
        return (
          <div key={p.id} className={"flex flex-wrap items-center gap-2 rounded-xl border bg-background p-3 " + (p.archived ? "opacity-60" : "")}>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 truncate font-semibold">{p.isDefault && <Star className="h-3.5 w-3.5 fill-gold text-gold" aria-label="Default" />}{instrumentLabel(p)}</div>
              <div className="text-xs text-muted-foreground">
                {INSTRUMENT_LABEL[p.type]} · linked to {acc ? acc.name : "a removed account"}
                {p.memberId ? ` · ${members.find((m) => m.id === p.memberId)?.name ?? "family member"}` : ""}
                {p.parentId ? ` · add-on of ${all.find((x) => x.id === p.parentId)?.nickname ?? "main card"}` : ""}
              </div>
            </div>
            <span className="font-mono text-sm font-semibold">{money(totals[p.id] ?? 0)}</span>
            <Button size="icon" variant="ghost" aria-label={`Edit ${p.nickname}`} onClick={() => setDraft({ ...blank(), ...p })}><Pencil className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" disabled={busy} aria-label={p.archived ? `Restore ${p.nickname}` : `Archive ${p.nickname}`}
              onClick={() => void persist(all.map((x) => (x.id === p.id ? { ...x, archived: !x.archived, isDefault: false } : x)), p.archived ? "Restored" : "Archived")}>
              {p.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            </Button>
          </div>
        );
      })}
      {draft ? (
        <div className="grid gap-3 rounded-xl border bg-background p-3 sm:grid-cols-2">
          <div className="grid gap-1"><Label>Type</Label>
            <Select value={draft.type} onValueChange={(v) => setType(v as InstrumentType)}><SelectTrigger aria-label="Payment method type"><SelectValue /></SelectTrigger>
              <SelectContent>{INSTRUMENT_TYPES.map((t) => <SelectItem key={t} value={t}>{INSTRUMENT_LABEL[t]}</SelectItem>)}</SelectContent></Select></div>
          <div className="grid gap-1"><Label htmlFor="pm-name">Name</Label><Input id="pm-name" placeholder="GPay HDFC" value={draft.nickname} onChange={(e) => setDraft({ ...draft, nickname: e.target.value })} /></div>
          {usesUpiHandle(draft.type) && <div className="grid gap-1"><Label htmlFor="pm-upi">UPI ID</Label><Input id="pm-upi" placeholder="name@okhdfc" autoCapitalize="none" value={draft.handle ?? ""} onChange={(e) => setDraft({ ...draft, handle: e.target.value })} /></div>}
          {usesLastFour(draft.type) && <div className="grid gap-1"><Label htmlFor="pm-last4">Last 4 digits</Label><Input id="pm-last4" inputMode="numeric" maxLength={4} placeholder="4821" value={draft.lastFour ?? ""} onChange={(e) => setDraft({ ...draft, lastFour: e.target.value.replace(/\D/g, "").slice(0, 4) })} /></div>}
          <div className="grid gap-1"><Label>Linked account</Label>
            <Select value={draft.accountId || "none"} onValueChange={(v) => setDraft({ ...draft, accountId: v === "none" ? "" : v })}><SelectTrigger aria-label="Linked account"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">Choose account</SelectItem>{allowed.map((a) => <SelectItem key={a.id} value={a.id}>{a.name} · {ACCOUNT_LABEL[a.kind]}</SelectItem>)}</SelectContent></Select>
            {allowed.length === 0 && <p className="text-xs text-warning">Add a matching account on Wealth first.</p>}</div>
          <div className="grid gap-1"><Label>Used by</Label>
            <Select value={draft.memberId ?? "me"} onValueChange={(v) => setDraft({ ...draft, memberId: v === "me" ? null : v })}><SelectTrigger aria-label="Used by"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="me">Me</SelectItem>{members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent></Select></div>
          {["credit_card", "debit_card"].includes(draft.type) && mainCards.length > 0 && <div className="grid gap-1"><Label>Add-on of</Label>
            <Select value={draft.parentId ?? "none"} onValueChange={(v) => setDraft({ ...draft, parentId: v === "none" ? null : v })}><SelectTrigger aria-label="Add-on of"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">Not an add-on card</SelectItem>{mainCards.map((m) => <SelectItem key={m.id} value={m.id}>{instrumentLabel(m)}</SelectItem>)}</SelectContent></Select></div>}
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={!!draft.isDefault} onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })} />Use by default for new entries</label>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
            <Button variant="gold" disabled={busy} onClick={() => void submit()}>{busy ? "Saving…" : "Save payment method"}</Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" className="justify-self-start" onClick={() => setDraft(blank(accountId))}>Add payment method</Button>
      )}
    </div>
  );
}
