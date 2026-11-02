import { useEffect, useState } from "react";
import { Delete, ScanFace } from "lucide-react";
import { MPIN_LENGTH } from "@/lib/mpin";

/** Four dots plus a phone-style keypad. Calls onComplete once all digits are entered. */
export function PinPad({ onComplete, busy = false, onFaceId, error, label = "Enter your MPIN" }: {
  onComplete: (pin: string) => void | Promise<void>; busy?: boolean; onFaceId?: () => void; error?: string; label?: string;
}) {
  const [pin, setPin] = useState("");
  useEffect(() => { if (error) setPin(""); }, [error]);
  const press = (d: string) => {
    if (busy || pin.length >= MPIN_LENGTH) return;
    const next = pin + d; setPin(next);
    if (next.length === MPIN_LENGTH) void Promise.resolve(onComplete(next)).finally(() => setPin(""));
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (/^\d$/.test(e.key)) press(e.key); else if (e.key === "Backspace") setPin((p) => p.slice(0, -1)); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  });
  const key = "grid h-16 place-items-center rounded-full text-2xl font-medium text-foreground transition active:scale-95 active:bg-secondary disabled:opacity-40";
  return <div className="mx-auto w-full max-w-[18rem]">
    <p className="text-center text-sm font-medium text-muted-foreground">{label}</p>
    <div className="my-5 flex justify-center gap-4" role="status" aria-label={`${pin.length} of ${MPIN_LENGTH} digits entered`}>
      {Array.from({ length: MPIN_LENGTH }, (_, i) => <span key={i} className={"h-3.5 w-3.5 rounded-full border-2 border-primary transition " + (i < pin.length ? "bg-primary" : "")} />)}
    </div>
    <p role="alert" className="mb-3 min-h-5 text-center text-sm text-destructive">{error}</p>
    <div className="grid grid-cols-3 gap-3">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => <button key={d} type="button" disabled={busy} className={key + " bg-card shadow-sm ring-1 ring-border"} onClick={() => press(d)}>{d}</button>)}
      {onFaceId ? <button type="button" aria-label="Use Face ID" disabled={busy} className={key + " text-primary"} onClick={onFaceId}><ScanFace className="h-7 w-7" /></button> : <span />}
      <button type="button" disabled={busy} className={key + " bg-card shadow-sm ring-1 ring-border"} onClick={() => press("0")}>0</button>
      <button type="button" aria-label="Delete digit" disabled={busy || !pin} className={key} onClick={() => setPin((p) => p.slice(0, -1))}><Delete className="h-6 w-6" /></button>
    </div>
  </div>;
}
