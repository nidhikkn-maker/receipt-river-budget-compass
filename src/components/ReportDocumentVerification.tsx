import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";

export interface ReportDocumentCheck { id: string; title: string; error: string | null }
export function ReportDocumentVerification({ rows, required, onDecision }: { rows: ReportDocumentCheck[]; required: boolean; onDecision: (proceed: boolean) => void }) {
  const failed = rows.filter(r => r.error);
  return <Dialog open onOpenChange={open => { if (!open) onDecision(false); }}>
    <DialogContent><DialogHeader><DialogTitle>Verify supporting documents</DialogTitle></DialogHeader>
      <p className="text-sm">{rows.length - failed.length} readable · {failed.length} missing or unreadable</p>
      <ul className="max-h-72 overflow-auto divide-y">{rows.map(row => <li key={row.id} className="py-2 text-sm"><p className="break-words">{row.title}</p><p className={row.error ? "text-destructive" : "text-muted-foreground"}>{row.error ?? "Ready for annexure"}</p></li>)}</ul>
      {failed.length > 0 && <p role="alert" className="text-sm text-destructive">{required ? "Required bills must be readable before this claim can be generated." : "Missing documents will be listed before the annexures. This report is incomplete evidence."}</p>}
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => onDecision(false)}>Cancel</Button><Button disabled={required && failed.length > 0} onClick={() => onDecision(true)}>Confirm documents & generate</Button></div>
    </DialogContent>
  </Dialog>;
}