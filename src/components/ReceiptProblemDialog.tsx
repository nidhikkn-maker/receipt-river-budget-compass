import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NOTE_MAX, PROBLEM_KINDS, deviceSummaryLines, type DeviceFacts, type ProblemKindId } from "@/lib/device-report";
import { reportReceiptProblem } from "@/lib/receipt-problems.functions";

/**
 * "Report a problem" for the receipt viewer: pick what went wrong, add a line if you like,
 * and send it with this device's and browser's details attached automatically.
 */
export function ReceiptProblemDialog({ open, onOpenChange, receipt, zoom, facts }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receipt: { name: string; type: string };
  zoom: number;
  facts: DeviceFacts;
}) {
  const send = useServerFn(reportReceiptProblem);
  const [kind, setKind] = useState<ProblemKindId | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lines = deviceSummaryLines(facts);

  const submit = async () => {
    if (!kind || busy) return;
    setBusy(true);
    setError("");
    try {
      const out = await send({ data: { kind, note, receiptName: receipt.name, receiptType: receipt.type, zoom, facts } });
      toast.success(out.emailed ? "Reported — we've emailed it to you as well" : "Reported — saved under Settings → Problem reports");
      onOpenChange(false);
      setKind("");
      setNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send your report — please try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }} onPointerDownOutside={(event) => { if (busy) event.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle>Report a receipt viewing problem</DialogTitle>
          <DialogDescription>Tell us what went wrong. Your device and browser details are attached automatically, so we can reproduce it.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">What went wrong?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {PROBLEM_KINDS.map((option) => (
                <label key={option.id} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm ${kind === option.id ? "border-primary bg-primary/5 font-semibold" : ""}`}>
                  <input type="radio" name="receipt-problem-kind" value={option.id} checked={kind === option.id} onChange={() => setKind(option.id)} disabled={busy} className="size-4 shrink-0" />
                  <span className="min-w-0">{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="space-y-2">
            <label htmlFor="receipt-problem-note" className="text-sm font-semibold">Anything else? (optional)</label>
            <textarea id="receipt-problem-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={NOTE_MAX} rows={3} disabled={busy} placeholder="What were you doing when it went wrong?" className="w-full rounded-xl border bg-background px-3 py-2 text-sm" />
            <p className="text-xs text-muted-foreground">{note.length}/{NOTE_MAX}</p>
          </div>
          <details className="rounded-xl border bg-muted/40 px-3 py-2">
            <summary className="min-h-8 cursor-pointer text-sm font-semibold select-none">Device details we'll send</summary>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {lines.map((line) => <li key={line}>{line}</li>)}
            </ul>
            {facts.log?.length ? <ul className="mt-2 space-y-1 text-xs text-muted-foreground">{facts.log.map((line) => <li key={line}>{line}</li>)}</ul> : null}
            <p className="mt-2 break-all text-xs text-muted-foreground">{facts.ua || "Browser details not readable here"}</p>
          </details>
          {error ? <p role="alert" className="text-sm font-semibold text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy || !kind} loading={busy}>{busy ? "Sending…" : "Send report"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
