import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ACCOUNT_LABEL, type Account, type AccountKind } from "@/lib/ledger";
import { duplicateAccount } from "@/lib/master-data";
import { money } from "@/lib/expenses";
import type { AccountHint, StmtFile } from "@/lib/statement-pipeline/line";

const KINDS: AccountKind[] = ["savings", "current", "credit_card", "wallet", "loan", "other_asset", "other_liability"];

/** Prefilled "new account found" card: every detail comes from the statement and stays editable until the owner taps Create. */
export function NewStatementAccount({ hint, file, accounts, onEdit, onCreate }: {
  hint: AccountHint | null; file: StmtFile; accounts: Account[];
  onEdit: (patch: Partial<AccountHint>) => void; onCreate: () => Promise<void>;
}) {
  if (!hint) return null;
  const dup = duplicateAccount(accounts.filter((a) => !a.archived), { name: hint.name, kind: hint.kind, lastFour: hint.lastFour });
  return (
    <div role="group" aria-label="New account found" className="mt-2 space-y-2 rounded-xl border-2 border-primary/40 bg-card p-3">
      <p className="text-sm font-semibold">New account found</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-xs">Name<Input value={hint.name} onChange={(e) => onEdit({ name: e.target.value })} /></label>
        <label className="grid gap-1 text-xs">Type
          <select className="h-10 rounded-md border border-input bg-background px-2 text-sm" value={hint.kind} onChange={(e) => onEdit({ kind: e.target.value as AccountKind })}>
            {KINDS.map((k) => <option key={k} value={k}>{ACCOUNT_LABEL[k]}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs">Bank<Input value={hint.issuer} onChange={(e) => onEdit({ issuer: e.target.value })} /></label>
        <label className="grid gap-1 text-xs">Last 4 digits<Input inputMode="numeric" maxLength={4} value={hint.lastFour ?? ""} onChange={(e) => onEdit({ lastFour: e.target.value.replace(/\D/g, "").slice(0, 4) || null })} /></label>
      </div>
      <p className="text-xs text-muted-foreground">
        {[hint.holder && `Holder ${hint.holder}`, hint.ifsc && `IFSC ${hint.ifsc}`, file.currency !== "INR" && file.currency].filter(Boolean).join(" · ")}
        {hint.holder || hint.ifsc ? " · " : ""}
        Opening balance {file.opening != null ? `${money(file.opening, file.currency)} (printed on the statement)` : "not printed — starts at 0, you can adjust it later"}
      </p>
      {dup && <p role="alert" className="text-xs text-destructive">You already have “{dup.name}”. Choose it above instead of creating a second copy.</p>}
      <Button type="button" size="sm" disabled={!!dup || !hint.name.trim()} onClick={onCreate}>Create account</Button>
    </div>
  );
}
