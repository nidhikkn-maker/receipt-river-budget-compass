/**
 * In-app replacement for a browser pop-up prompt: one labelled field, an explanation near it, inline validation,
 * Cancel and one clearly named primary action. A bottom sheet on phone widths (`native-sheet`) and a centred dialog
 * on wider screens. Escape, the close button and Cancel change nothing; while saving, it cannot be dismissed.
 */
import { useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface ValueDialogProps {
  open: boolean;
  title: string;
  /** Plain-language explanation of what saving does, shown under the title. */
  description?: string;
  label: string;
  /** Current value, prefilled when the dialog opens. */
  initialValue?: string;
  /** "decimal" brings up the number keypad on phones; the text is still parsed by the caller exactly as typed. */
  inputMode?: "text" | "decimal";
  placeholder?: string;
  /** Shown under the field while there is no problem. */
  hint?: string;
  confirmLabel: string;
  /** Returns the problem to show, or null when the value can be saved. */
  validate: (value: string) => string | null;
  /** Saves the value. Resolve to close; a rejection keeps the dialog open and shows the reason under the field. */
  onSubmit: (value: string) => Promise<unknown>;
  /** Called on Cancel, Escape or close (nothing saved) and after a successful save. */
  onClose: () => void;
}

export function ValueDialog({
  open,
  title,
  description,
  label,
  initialValue = "",
  inputMode = "text",
  placeholder,
  hint,
  confirmLabel,
  validate,
  onSubmit,
  onClose,
}: ValueDialogProps) {
  const [value, setValue] = useState(initialValue);
  const [attempted, setAttempted] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  // Start fresh each time it opens (the current value, no old error); a store refresh while open never wipes typing.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setValue(initialValue);
      setAttempted(false);
      setFailure(null);
      setBusy(false);
    }
  }
  const problem = validate(value);
  const message = failure ?? (attempted ? problem : null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setAttempted(true);
    setFailure(null);
    if (problem) {
      input.current?.focus();
      return;
    }
    setBusy(true);
    try {
      await onSubmit(value);
      setBusy(false);
      onClose();
    } catch (err) {
      setBusy(false);
      setFailure(
        err instanceof Error && err.message ? err.message : "Couldn't save. Please try again.",
      );
      input.current?.focus();
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent
        className="native-sheet sm:max-w-md"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          input.current?.focus();
          input.current?.select();
        }}
      >
        <form onSubmit={(e) => void submit(e)} className="grid gap-4" noValidate>
          <DialogHeader className="pr-10 text-left">
            <DialogTitle className="break-words">{title}</DialogTitle>
            {description ? (
              <DialogDescription>{description}</DialogDescription>
            ) : (
              <DialogDescription className="sr-only">{label}</DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor={`${id}-value`}>{label}</Label>
            <Input
              ref={input}
              id={`${id}-value`}
              value={value}
              inputMode={inputMode}
              placeholder={placeholder}
              autoComplete="off"
              disabled={busy}
              aria-invalid={message ? true : undefined}
              aria-describedby={`${id}-note`}
              onChange={(e) => {
                setValue(e.target.value);
                setFailure(null);
              }}
            />
            {message ? (
              <p id={`${id}-note`} role="alert" className="text-sm text-destructive">
                {message}
              </p>
            ) : (
              <p id={`${id}-note`} className="text-xs text-muted-foreground">
                {hint ?? ""}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
