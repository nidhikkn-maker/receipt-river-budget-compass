/**
 * In-app replacement for a browser pop-up confirmation (window.confirm): it names the record, states exactly what
 * happens, and offers Cancel plus one clearly named primary action (destructive-styled for removals, reversals and
 * period closing). Optional parts: a reason field (when the operation keeps a reason), a typed confirmation (type the
 * period, year or name shown) and extra content such as a choice of account. A bottom sheet on phone widths
 * (`native-sheet`) and a centred dialog on wider screens. Escape, the close button and Cancel change nothing; while the
 * action runs it cannot be dismissed, and a failure keeps it open with the reason shown.
 */
import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
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
import { Textarea } from "@/components/ui/textarea";

/** Typed confirmation matches ignoring case, surrounding spaces and repeated spaces (the phrase itself is shown). */
export const typedMatches = (typed: string, phrase: string) => {
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  return norm(typed) === norm(phrase);
};

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** What happens, in plain words. */
  description: ReactNode;
  /** Consequences listed under the description. */
  consequences?: string[];
  destructive?: boolean;
  confirmLabel: string;
  cancelLabel?: string;
  /** A reason kept with the record. `validate` returns the problem to show, or null when it can be used. */
  reason?: {
    label: string;
    placeholder?: string;
    hint?: string;
    maxLength?: number;
    validate: (value: string) => string | null;
  };
  /** Require typing this exact phrase (shown to the person) before the action is enabled. */
  typed?: { phrase: string; label?: string };
  /** Extra content between the description and the buttons, such as a choice of account. */
  children?: ReactNode;
  /** False keeps the primary action disabled (for example until an account is chosen). */
  ready?: boolean;
  /** Runs the action with the reason as typed. Resolve to close; a rejection keeps the dialog open with its message. */
  onConfirm: (reason: string) => Promise<unknown>;
  /** Called on Cancel, Escape or close (nothing done) and after the action succeeds. */
  onClose: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  consequences,
  destructive = false,
  confirmLabel,
  cancelLabel = "Cancel",
  reason,
  typed,
  children,
  ready = true,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const [text, setText] = useState("");
  const [phrase, setPhrase] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const id = useId();
  // Start fresh each time it opens; a store refresh while open never wipes typing.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setText("");
      setPhrase("");
      setAttempted(false);
      setFailure(null);
      setBusy(false);
    }
  }
  const problem = reason ? reason.validate(text) : null;
  const reasonMessage = attempted ? problem : null;
  const typedOk = !typed || typedMatches(phrase, typed.phrase);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !typedOk || !ready) return;
    setAttempted(true);
    setFailure(null);
    if (problem) {
      field.current?.focus();
      return;
    }
    setBusy(true);
    try {
      await onConfirm(text);
      setBusy(false);
      onClose();
    } catch (err) {
      setBusy(false);
      setFailure(
        err instanceof Error && err.message ? err.message : "That didn't work. Please try again.",
      );
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
        className="native-sheet max-h-[90dvh] overflow-y-auto sm:max-w-lg"
        onOpenAutoFocus={(e) => {
          // Start in the first field; with nothing to type, start on Cancel so Enter never confirms by accident.
          e.preventDefault();
          const first = document.getElementById(reason ? `${id}-reason` : typed ? `${id}-typed` : "");
          (first ?? cancel.current)?.focus();
        }}
      >
        <form onSubmit={(e) => void submit(e)} className="grid gap-4" noValidate>
          <DialogHeader className="pr-10 text-left">
            <DialogTitle className="break-words">{title}</DialogTitle>
            <DialogDescription className="break-words">{description}</DialogDescription>
          </DialogHeader>
          {consequences?.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {consequences.map((c) => (
                <li key={c} className="break-words">
                  {c}
                </li>
              ))}
            </ul>
          ) : null}
          {children}
          {reason ? (
            <div className="space-y-1">
              <Label htmlFor={`${id}-reason`}>{reason.label}</Label>
              <Textarea
                ref={field}
                id={`${id}-reason`}
                value={text}
                rows={3}
                maxLength={reason.maxLength ?? 500}
                placeholder={reason.placeholder}
                disabled={busy}
                aria-invalid={reasonMessage ? true : undefined}
                aria-describedby={`${id}-reason-note`}
                onChange={(e) => {
                  setText(e.target.value);
                  setFailure(null);
                }}
              />
              {reasonMessage ? (
                <p id={`${id}-reason-note`} role="alert" className="text-sm text-destructive">
                  {reasonMessage}
                </p>
              ) : (
                <p id={`${id}-reason-note`} className="text-xs text-muted-foreground">
                  {reason.hint ?? ""}
                </p>
              )}
            </div>
          ) : null}
          {typed ? (
            <div className="space-y-1">
              <Label htmlFor={`${id}-typed`}>
                {typed.label ?? "Type"} <span className="font-mono font-semibold">{typed.phrase}</span>{" "}
                to confirm
              </Label>
              <Input
                id={`${id}-typed`}
                value={phrase}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                disabled={busy}
                aria-describedby={`${id}-typed-note`}
                onChange={(e) => {
                  setPhrase(e.target.value);
                  setFailure(null);
                }}
              />
              <p id={`${id}-typed-note`} className="text-xs text-muted-foreground">
                {typedOk ? "Matches." : "The button stays off until this matches exactly."}
              </p>
            </div>
          ) : null}
          {failure ? (
            <p role="alert" className="break-words text-sm text-destructive">
              {failure}
            </p>
          ) : null}
          <DialogFooter className="gap-2">
            <Button ref={cancel} type="button" variant="outline" disabled={busy} onClick={onClose}>
              {cancelLabel}
            </Button>
            <Button
              type="submit"
              variant={destructive ? "destructive" : "default"}
              disabled={!typedOk || !ready}
              loading={busy}
            >
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
