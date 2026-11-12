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
 * Key-value money row. The amount never wraps: when a long label and a long amount (e.g. ₹12,34,56,789.00) do not fit
 * on one line, the amount drops to its own right-aligned line instead of squeezing the label (density audit SH-9).
 * `money-row` lets the Signature Flow theme cap key-value groups to a readable width on wide screens (SH-8).
 */
export function Row({ label, value, strong, tone }: { label: string; value: ReactNode; strong?: boolean | undefined; tone?: "good" | "bad" | undefined }) {
  return (
    <div className="money-row flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b py-3 text-sm last:border-0">
      <span className="min-w-0 flex-auto text-muted-foreground">{label}</span>
      <span className={cn("ml-auto shrink-0 whitespace-nowrap text-right font-mono font-semibold", strong && "text-base", tone === "good" && "text-success", tone === "bad" && "text-destructive")}>{value}</span>
    </div>
  );
}
export function Bar({ pct }: { pct: number }) {
  return <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gold-hero" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>;
}
export const fieldCls = "h-11 w-full rounded-xl border bg-background px-3 text-sm";
