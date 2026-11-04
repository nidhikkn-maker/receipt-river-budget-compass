import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { continuousAudit, type AuditItem } from "@/lib/books/audit";
import { emptyBooks } from "@/lib/books/types";
import type { InboxItem } from "@/lib/inbox";
import { netQuantity } from "@/lib/investments/demat";
import { useDemat } from "./useBooks";

/** Continuous audit findings from saved records. */
export function useAudit(): AuditItem[] {
  const { preferences, transactions, documents, accounts } = useStore();
  const demat = useDemat();
  return useMemo(() => continuousAudit({
    today: new Date().toISOString().slice(0, 10), entities: preferences.entities ?? [], assets: preferences.assets ?? [], entries: transactions, docs: documents, accounts,
    books: preferences.books ?? emptyBooks(),
    holdingsWithoutCost: (demat ?? []).flatMap((d) => d.holdings).filter((h) => !h.lots.some((l) => l.side === "buy") || Math.abs(netQuantity(h.lots) - h.quantity) > 1e-6).map((h) => ({ name: h.name, isin: h.isin })),
  }), [preferences, transactions, documents, accounts, demat]);
}

/** Audit findings as Financial Inbox items — one queue [§53]. Items already covered by the Inbox are skipped. */
export function auditInboxItems(items: AuditItem[]): InboxItem[] {
  return items.filter((i) => !["Unreconciled bank", "Classification", "Duplicate"].includes(i.type)).map((i) => ({
    key: `audit:${i.key}`, type: "audit", title: `${i.type}${i.entity ? ` · ${i.entity}` : ""}`, description: i.text, amount: null, accountName: i.account, date: null,
    priority: i.risk, action: "Open", 
  }));
}
