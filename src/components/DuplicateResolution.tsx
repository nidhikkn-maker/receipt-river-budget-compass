import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { separateReasonError } from "@/lib/duplicate-decision";

/**
 * Answer to a possible duplicate: "It's separate" is accepted only with a written reason (kept with the saved entry
 * as audit evidence); "It's the same bill" keeps it from being posted. Nothing is saved from here.
 */
export function DuplicateResolution({ resolved, reason: savedReason, onSeparate, onSame, onReopen, disabled }: {
  resolved: boolean;
  reason?: string | undefined;
  onSeparate: (reason: string) => void;
  onSame?: (() => void) | undefined;
  onReopen: () => void;
  disabled?: boolean | undefined;
}) {
  const id = useId();
  const [reason, setReason] = useState(savedReason ?? "");
  const [tried, setTried] = useState(false);
  const error = separateReasonError(reason);
  if (resolved) return (
    <p role="status" className="flex flex-wrap items-center gap-2 text-sm">
      <span><b>Separate bill confirmed.</b> Reason: {savedReason}</span>
      <Button type="button" size="sm" variant="ghost" onClick={onReopen}>Change</Button>
    </p>
  );
  return (
    <div className="grid gap-2">
      <label htmlFor={`${id}-reason`} className="text-sm font-semibold">If it's a separate bill, say why</label>
      <Input id={`${id}-reason`} value={reason} maxLength={300} placeholder="For example: second order, different bill number" aria-invalid={tried && !!error} aria-describedby={`${id}-why`} onChange={(e) => setReason(e.target.value)} />
      <p id={`${id}-why`} className={tried && error ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{tried && error ? error : "The reason is kept with the entry, with who decided and when."}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" disabled={disabled} onClick={() => { setTried(true); if (!error) onSeparate(reason.trim()); }}>It's separate</Button>
        {onSame && <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onSame}>It's the same bill</Button>}
      </div>
    </div>
  );
}
