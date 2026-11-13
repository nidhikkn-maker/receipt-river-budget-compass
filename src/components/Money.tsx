import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({ title, children, className, action, "aria-label": label }: { title?: string; children: ReactNode; className?: string; action?: ReactNode; "aria-label"?: string }) {
  return (
    <section aria-label={label} className={cn("uix-section mb-6 min-w-0 border-t bg-transparent py-5", className)}>
      {(title || action) && <div className="mb-3 flex items-center justify-between gap-2"><h2 className="font-display text-base font-semibold">{title}</h2>{action}</div>}
      {children}
    </section>
  );
}
/**
 * Values that read as one amount or figure ("₹12,34,56,789.00", "-$1,200.50", "USD 1,200.00", "42%", "7", "—"):
 * numbers, or short strings with no ordinary space other than one after a currency code. Anything else (a list
 * such as "HDFC Savings, ICICI card", a sentence, a date with a time) is text and wraps like text.
 * Accepts what money() / Intl produce for coded currencies: "AED 1,234.50" with a no-break space (U+00A0 or U+202F)
 * after the code, an optional leading sign before the code ("-AED 1,234,567.50"), and a typographic minus or sign
 * followed by a space ("− ₹1,234.00", "+ USD 50.00"). `\s` covers the no-break spaces, so they are matched as spaces.
 */
const AMOUNT_TEXT = /^(?:[+\-\u2212]\s?(?=[^\sA-Za-z]|[A-Z]{3}\s))?(?:[A-Z]{3}\s)?[^\s]{1,32}$/u;
export function isAmountValue(value: ReactNode): boolean {
  if (typeof value === "number" || typeof value === "bigint") return true;
  if (typeof value === "string") return AMOUNT_TEXT.test(value.trim());
  return true; // elements are formatted amounts in every current caller; pass kind="text" for rich text
}
/**
 * Key-value row. An amount never breaks mid-number: when a long label and a long amount do not fit on one line, the
 * amount drops to its own right-aligned line instead of squeezing the label (density audit SH-9). A text value
 * (e.g. a list of account names) wraps normally within the row, left-aligned so wrapped lines start at one edge
 * (amounts stay right-aligned), so it never overflows the screen; it opts out of the
 * global `.font-mono` nowrap rule (styles.css, "Money figures") with an explicit whitespace-normal. `kind` is
 * inferred from the value (see isAmountValue); callers that pass lists or sentences can say kind="text".
 * `money-row` lets the Signature Flow theme cap key-value groups to a readable width on wide screens (SH-8).
 */
export function Row({ label, value, strong, tone, kind }: { label: string; value: ReactNode; strong?: boolean | undefined; tone?: "good" | "bad" | undefined; kind?: "amount" | "text" | undefined }) {
  const amount = (kind ?? (isAmountValue(value) ? "amount" : "text")) === "amount";
  return (
    <div className="money-row flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b py-3 text-sm last:border-0">
      <span className="min-w-0 flex-auto text-muted-foreground">{label}</span>
      <span data-value-kind={amount ? "amount" : "text"} className={cn("ml-auto font-mono font-semibold", amount ? "shrink-0 whitespace-nowrap text-right" : "min-w-0 whitespace-normal text-left [overflow-wrap:anywhere]", strong && "text-base", tone === "good" && "text-success", tone === "bad" && "text-destructive")}>{value}</span>
    </div>
  );
}
export function Bar({ pct }: { pct: number }) {
  return <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gold-hero" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>;
}
export const fieldCls = "h-11 w-full rounded-xl border bg-background px-3 text-sm";
