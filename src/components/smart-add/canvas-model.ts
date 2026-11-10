import { sourceKind } from "@/components/SourcePreview";
import { displayDate } from "@/lib/date-display";

/** Pure rules for the Intelligent Canvas: what each choice means, where a source is reviewed, and the step shown. */

export type CanvasKind = "receipt" | "statement" | "travel" | "asset";

/** One short helper line per choice (KK decision 8); a receipt needs none, as in reference 08. */
export const CANVAS_KINDS: readonly { id: CanvasKind; label: string; hint: string }[] = [
  { id: "receipt", label: "Receipt", hint: "" },
  { id: "statement", label: "Statement", hint: "Checked line by line in Statement Desk." },
  { id: "travel", label: "Travel", hint: "Read like any bill and tagged to your trip." },
  { id: "asset", label: "Asset register", hint: "Checked in Statement Desk for assets." },
];

/** The one helper line under the choices: a statement's purpose, or the trip a travel bill is tagged to. */
export function kindHint(kind: CanvasKind, contextLabel?: string | null, tripName?: string | null): string {
  if (kind === "statement" && contextLabel) return `Checked in Statement Desk for ${contextLabel}.`;
  if (kind === "travel") return tripName ? `Tagged to your trip “${tripName}”.` : "No current trip, so it is saved as an ordinary expense.";
  return CANVAS_KINDS.find((k) => k.id === kind)?.hint ?? "";
}

/**
 * Height of an on-screen keyboard (and its accessory bar) covering the bottom of the layout viewport, from the
 * visual viewport. Below 80 px it is treated as browser chrome, not a keyboard.
 */
export function keyboardInset(innerHeight: number, viewportHeight: number, viewportTop: number): number {
  const covered = Math.round(innerHeight - viewportHeight - viewportTop);
  return covered >= 80 ? covered : 0;
}

export const STEP_LABELS = ["Add", "Review", "Confirm"] as const;

/**
 * Where picked files are reviewed. Statements and asset registers always use Statement Desk (the authoritative
 * intake); a spreadsheet is never a receipt; receipts and travel bills use the existing receipt review.
 */
export function canvasRoute(kind: CanvasKind, files: File[]): "receipt" | "statement" {
  if (kind === "statement" || kind === "asset") return "statement";
  if (files.some((f) => sourceKind(f) === "sheet")) return "statement";
  return "receipt";
}

/** 1 · Add, 2 · Review, 3 · Confirm (and the result stays on 3). */
export function stepOf(phase: "add" | "receipt" | "statement" | "done", confirming: boolean): 1 | 2 | 3 {
  if (phase === "add") return 1;
  if (phase === "done" || confirming) return 3;
  return 2;
}

export interface ReviewSummary { headline: string; subline: string; original: string; account: string | null; accountState: "unselected" | "suggested" | "confirmed"; accountEvidence: string | null; rows: { label: string; value: string }[] }

/** Confirm and save is allowed only once the owner has chosen or confirmed the account (never a suggestion). */
export const canConfirm = (s: ReviewSummary | null) => !!s && s.accountState === "confirmed";

const text = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
function fieldValue(form: HTMLFormElement, selector: string): string {
  const el = form.querySelector(selector);
  if (!el) return "";
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) return el.value.trim();
  // A field that shows a formatted value (the date field shows "09 Nov 2026") carries its stored value here.
  const stored = el.getAttribute("data-value");
  if (stored != null) return stored.trim();
  return text(el);
}

/**
 * A read-only summary of what the review form will save, taken from the form as the owner left it. It is
 * shown for confirmation only; the save itself still goes through the review's own checks and save path.
 */
export function readReviewForm(form: HTMLFormElement | null, files: File[]): ReviewSummary {
  const original = files.length ? files.map((f) => f.name).join(", ") : "Typed or spoken entry";
  if (!form) return { headline: "Your entry", subline: "Check the details, then confirm", original, account: null, accountState: "unselected", accountEvidence: null, rows: [] };
  const amount = fieldValue(form, "#a");
  const currency = fieldValue(form, '[aria-label="Currency"]');
  const merchant = fieldValue(form, "#m") || fieldValue(form, "#sm");
  const note = fieldValue(form, "#t");
  const date = fieldValue(form, "#d") || fieldValue(form, "#sd");
  const category = fieldValue(form, '[aria-label="Category"]');
  const rawState = form.getAttribute("data-account-state");
  const accountState = rawState === "confirmed" || rawState === "suggested" ? rawState : "unselected";
  const accountText = fieldValue(form, '[aria-label="Account"]');
  const account = accountState === "unselected" || !accountText || accountText === "Choose account" ? null : accountText;
  const accountEvidence = form.getAttribute("data-account-evidence") || null;
  const type = fieldValue(form, '[aria-label="Transaction type"]');
  const whom = fieldValue(form, '[aria-label="For whom"]');
  const what = merchant || note || "Your entry";
  const rows = [
    { label: "Amount", value: amount ? `${currency || "INR"} ${amount}` : "" },
    { label: "Date", value: displayDate(date) },
    { label: "Category", value: category },
    { label: "Type", value: type },
    { label: "For whom", value: whom },
  ].filter((r) => r.value);
  return { headline: `${type || "Entry"} · ${what}`, subline: [amount && `${currency || "INR"} ${amount}`, displayDate(date), files.length ? "source linked" : ""].filter(Boolean).join(" · "), original, account, accountState, accountEvidence, rows };
}
