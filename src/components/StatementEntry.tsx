import { useState } from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { useStore } from "@/lib/store";
import { matchScore, type StatementLine } from "@/lib/expenses";
import { TXN_LABEL, TXN_TYPES, type TxnType } from "@/lib/ledger";
import type { StatementDraft } from "@/lib/statement-auto";

export function StatementEntry({ line, currency, draft, statementAccount }: { line: StatementLine; currency: string; draft?: StatementDraft; statementAccount?: string }) {
  const { save, transactions, accounts, preferences } = useStore();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(draft?.title ?? line.description);
  const [account, setAccount] = useState(draft?.accountId ?? "none");
  const [to, setTo] = useState(draft?.toAccountId ?? "none");
  const [type, setType] = useState<TxnType>(draft?.txnType ?? (line.direction === "credit" ? "income" : "expense"));
  const [category, setCategory] = useState(draft?.category ?? preferences.categories.find(c => !c.archived)?.name ?? "Miscellaneous");
  const [busy, setBusy] = useState(false);
  const [id] = useState(() => crypto.randomUUID());
  const cardCredit = line.direction === "credit" && accounts.some(a => a.id === statementAccount && a.kind === "credit_card");
  const duplicate = transactions.some(e => matchScore(line, e, currency, statementAccount) >= 0.95);
  const move = ["transfer", "card_payment", "loan_repayment", "investment"].includes(type);
  if (duplicate) return <p className="text-xs text-warning">Possible duplicate — already in your ledger</p>;
  if (!open) return <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Review missing entry</Button>;
  return <div className="grid gap-2 border-t pt-3 sm:grid-cols-3">
    <Input aria-label="Imported title" value={title} onChange={e => setTitle(e.target.value)} />
    <p className="text-sm">{line.date} · {line.amount} {currency}</p>
    <Select value={type} onValueChange={v => setType(v as TxnType)}><SelectTrigger aria-label="Imported type"><SelectValue /></SelectTrigger><SelectContent>{TXN_TYPES.filter(t => !cardCredit || ["card_payment", "refund"].includes(t)).map(t => <SelectItem key={t} value={t}>{TXN_LABEL[t]}</SelectItem>)}</SelectContent></Select>
    <Select value={account} onValueChange={setAccount}><SelectTrigger aria-label="Imported account"><SelectValue placeholder="Choose paying account" /></SelectTrigger><SelectContent><SelectItem value="none">Choose paying account</SelectItem>{accounts.filter(a => !a.archived && (type !== "card_payment" || ["savings", "current", "cash", "wallet"].includes(a.kind))).map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select>
    {move && <Select value={to} onValueChange={setTo}><SelectTrigger aria-label="Imported destination"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Choose destination</SelectItem>{accounts.filter(a => !a.archived && a.id !== account && (type !== "card_payment" || a.kind === "credit_card")).map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select>}
    <Select value={category} onValueChange={setCategory}><SelectTrigger aria-label="Imported category"><SelectValue /></SelectTrigger><SelectContent>{preferences.categories.filter(c => !c.archived).map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent></Select>
    {cardCredit && <p className="text-xs text-muted-foreground sm:col-span-3">Card repayments reduce outstanding, never income. Choose the actual paying account; existing payments must not be added again.</p>}
    <Button disabled={busy} onClick={async () => {
      setBusy(true);
      try {
        const source = type === "refund" && cardCredit ? statementAccount : account;
        if (!source || source === "none") throw Error("Choose the actual paying account");
        if (cardCredit && !["card_payment", "refund"].includes(type)) throw Error("Card credits cannot be income");
        if (move && (to === "none" || to === source)) throw Error("Choose a different destination account");
        if (statementAccount && move && (line.direction === "credit" ? to !== statementAccount : source !== statementAccount)) throw Error("Payment must match the statement account and direction");
        await save({ title, merchant: line.description, amount: line.amount, date: line.date, currency, category, scope: draft?.scope ?? "personal", memberId: null, description: line.description, paymentMethod: "bank_transfer", txnType: type, accountId: source, toAccountId: move ? to : null }, { createId: id });
        toast.success("Imported entry saved"); setOpen(false);
      } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
    }}>Confirm entry</Button>
    <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
  </div>;
}