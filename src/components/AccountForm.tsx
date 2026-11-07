// The one central add-account form (Version 4.9). Used on Accounts and contextually from entry
// screens, so every account is created through the same rules (duplicates, card details).
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ACCOUNT_KINDS, ACCOUNT_LABEL, isLiability, type AccountKind } from "@/lib/ledger";
import { useStore } from "@/lib/store";

export function AccountForm({ onCreated, kinds = ACCOUNT_KINDS, compact }: { onCreated?: (id: string) => void; kinds?: readonly AccountKind[]; compact?: boolean }) {
  const { addAccount } = useStore();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AccountKind>(kinds[0] ?? "savings");
  const [opening, setOpening] = useState("0");
  const [limit, setLimit] = useState("");
  const [due, setDue] = useState("");
  const [lastFour, setLastFour] = useState("");
  const [busy, setBusy] = useState(false);
  const card = kind === "credit_card";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      const id = await addAccount({ name, kind, openingBalance: Number(opening),
        ...(card ? { creditLimit: limit ? Number(limit) : null, dueDay: due ? Number(due) : null, lastFour: lastFour.replace(/\D/g, "").slice(0, 4) || null } : {}) });
      setName(""); setOpening("0"); setLimit(""); setDue(""); setLastFour("");
      toast.success("Account added");
      onCreated?.(id);
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className={compact ? "grid gap-3" : "grid content-start gap-3 rounded-3xl border bg-card p-5"}>
      {!compact && <h2 className="font-display text-lg font-bold">Add account</h2>}
      <div className="grid gap-1"><Label htmlFor="acc-name">Name</Label><Input id="acc-name" placeholder="e.g. HDFC Savings, AMEX" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="grid gap-1">
        <Label>Type</Label>
        <Select value={kind} onValueChange={(v) => setKind(v as AccountKind)}>
          <SelectTrigger aria-label="Account type"><SelectValue /></SelectTrigger>
          <SelectContent>{kinds.map((k) => <SelectItem key={k} value={k}>{ACCOUNT_LABEL[k]}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid gap-1">
        <Label htmlFor="acc-open">{isLiability(kind) ? "Amount owed today (₹)" : "Opening balance (₹)"}</Label>
        <Input id="acc-open" type="number" step="0.01" className="font-mono" value={opening} onChange={(e) => setOpening(e.target.value)} />
      </div>
      {card && (
        <div className="grid grid-cols-3 gap-2">
          <div className="grid gap-1"><Label htmlFor="acc-limit">Limit (₹)</Label><Input id="acc-limit" type="number" value={limit} onChange={(e) => setLimit(e.target.value)} /></div>
          <div className="grid gap-1"><Label htmlFor="acc-due">Due day</Label><Input id="acc-due" type="number" min={1} max={31} value={due} onChange={(e) => setDue(e.target.value)} /></div>
          <div className="grid gap-1"><Label htmlFor="acc-l4">Last 4</Label><Input id="acc-l4" inputMode="numeric" maxLength={4} value={lastFour} onChange={(e) => setLastFour(e.target.value)} /></div>
        </div>
      )}
      <Button type="submit" disabled={busy || !name.trim()}>{busy ? "Adding…" : "Add account"}</Button>
    </form>
  );
}
