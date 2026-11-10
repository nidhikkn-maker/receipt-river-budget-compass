/** Confirmation with a required reason before archiving or restoring a financial record (P0-001). */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { reasonProblem } from "@/lib/archive";

export type ArchiveNoun = "asset" | "holding" | "property"
  | "invoice" | "GST invoice" | "deduction" | "tax credit" | "profile" | "document" | "scheduled payment" | "goal" | "loan" | "valuation" | "lender balance" | "allocation plan" | "milestone" | "itinerary item";
export interface ArchiveRequest { mode: "archive" | "restore"; id: string; name: string; noun: ArchiveNoun }

const KEEPS: Record<ArchiveNoun, string> = {
  asset: "Its documents, depreciation history, ownership and accounting links are kept. Book value, depreciation and net worth do not change.",
  holding: "Its units, cost and documents are kept, and it is still valued and counted in net worth.",
  property: "Its units, leases, documents and links are kept, and its value is still counted.",
  invoice: "Its amount, GST and payment match are kept, and it still counts in what customers owe you.",
  "GST invoice": "Its number, tax amounts and links are kept, and it still counts in every GST draft.",
  deduction: "Its section, amount and proof are kept, and it still counts in the tax working.",
  "tax credit": "Its amount and source are kept, and it still counts in taxes already paid.",
  profile: "Its PAN, GST numbers, tax years and account links are kept. Entries do not change.",
  document: "The file, its details and every link to entries, assets and returns are kept.",
  "scheduled payment": "Its history and past entries are kept. It has already ended, so the plan does not change.",
  goal: "Its target and amount saved are kept, and any amount kept aside is still held back.",
  loan: "The loan, its repayment history and its account are kept, and it still counts in what you owe.",
  valuation: "The value and its date are kept, and it is still used for the account's value.",
  "lender balance": "The confirmed balance and its statement link are kept, and it is still used for what you owe.",
  "allocation plan": "Its lines are kept. A plan never moves money.",
  milestone: "Its target and progress history are kept.",
  "itinerary item": "Its booking and document links are kept. It leaves the day plan and calendar export.",
};
const DISPOSAL: Partial<Record<ArchiveNoun, string>> = {
  asset: "Archiving is not a sale. To record a sale, scrapping, transfer or write-off, use Lifecycle on the asset instead.",
  holding: "Archiving is not a sale. To record a sale or transfer, update the units from your statement instead.",
  property: "Archiving is not a sale. Record a sale through the linked asset's Lifecycle instead.",
  invoice: "Archiving does not cancel the invoice. To reduce what is owed, issue a credit note.",
  "GST invoice": "Archiving does not cancel the invoice. To correct it, use Amend or a credit/debit note.",
  deduction: "Archiving does not remove it from the tax working.",
  "tax credit": "Archiving does not remove it from taxes already paid.",
  loan: "Archiving does not close the loan. Close it by recording the final repayment.",
  valuation: "To correct a value, save a newer valuation; the latest date is used.",
  "lender balance": "To correct it, confirm a newer dated balance from the lender statement.",
};

export function ArchiveDialog({ request, onCancel, onConfirm }: { request: ArchiveRequest | null; onCancel: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  useEffect(() => { setReason(""); }, [request?.id, request?.mode]);
  const problem = reasonProblem(reason);
  const archive = request?.mode !== "restore";
  const noun = request?.noun ?? "asset";
  return (
    <Dialog open={request !== null} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{archive ? `Archive this ${noun}?` : `Restore this ${noun}?`}</DialogTitle>
          <DialogDescription className="break-words">
            {archive ? `${request?.name ?? ""} moves to Archived and stays in your records. ${KEEPS[noun]}` : `${request?.name ?? ""} goes back to your active list. Nothing else changes, and figures stay the same.`}
          </DialogDescription>
        </DialogHeader>
        {archive && DISPOSAL[noun] && <p className="text-sm text-muted-foreground">{DISPOSAL[noun]}</p>}
        <div className="space-y-1">
          <Label htmlFor="archive-reason">Reason</Label>
          <Textarea id="archive-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={archive ? "e.g. No longer in use; kept for records" : "e.g. Archived by mistake"} />
          <p className="text-xs text-muted-foreground">{reason.trim() && problem ? problem : "Saved with the record, with who did it and when."}</p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button disabled={!!problem} onClick={() => { if (!problem) onConfirm(reason.trim()); }}>{archive ? `Archive ${noun}` : `Restore ${noun}`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
