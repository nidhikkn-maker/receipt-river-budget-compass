/** Confirmation with a required reason before archiving or restoring a financial record (P0-001). */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { reasonProblem } from "@/lib/archive";

export type ArchiveNoun = "asset" | "holding" | "property";
export interface ArchiveRequest { mode: "archive" | "restore"; id: string; name: string; noun: ArchiveNoun }

const KEEPS: Record<ArchiveNoun, string> = {
  asset: "Its documents, depreciation history, ownership and accounting links are kept. Book value, depreciation and net worth do not change.",
  holding: "Its units, cost and documents are kept, and it is still valued and counted in net worth.",
  property: "Its units, leases, documents and links are kept, and its value is still counted.",
};
const DISPOSAL: Record<ArchiveNoun, string> = {
  asset: "Archiving is not a sale. To record a sale, scrapping, transfer or write-off, use Lifecycle on the asset instead.",
  holding: "Archiving is not a sale. To record a sale or transfer, update the units from your statement instead.",
  property: "Archiving is not a sale. Record a sale through the linked asset's Lifecycle instead.",
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
        {archive && <p className="text-sm text-muted-foreground">{DISPOSAL[noun]}</p>}
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
