// Density audit SH-8/SH-9: a key-value money row keeps the amount on one line and lets it drop to its own
// right-aligned line beside a long label, instead of squeezing the label into a narrow column.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isAmountValue, Row } from "./Money";
import { money } from "@/lib/expenses";

afterEach(cleanup);

describe("Money Row", () => {
  it("renders a crore-scale amount whole, on one line, after a long label", () => {
    render(<Row label="Card charges not matched to a statement" value="₹12,34,56,789.00" strong tone="bad" />);
    const label = screen.getByText("Card charges not matched to a statement");
    const amount = screen.getByText("₹12,34,56,789.00");
    const row = label.parentElement!;
    expect(row).toBe(amount.parentElement);
    expect(row).toHaveClass("money-row", "flex", "flex-wrap");
    expect(label).toHaveClass("min-w-0", "flex-auto");
    expect(amount).toHaveClass("ml-auto", "shrink-0", "whitespace-nowrap", "text-right", "text-destructive", "text-base");
    expect(row.textContent).toBe("Card charges not matched to a statement₹12,34,56,789.00");
  });
  it("keeps the label before the amount for reading order", () => {
    render(<Row label="Calculated settlement with the company" value="₹1,00,000.00" />);
    const row = screen.getByText("Calculated settlement with the company").parentElement!;
    expect([...row.children].map((c) => c.textContent)).toEqual(["Calculated settlement with the company", "₹1,00,000.00"]);
  });
  it("wraps a long text value (a list of account names) instead of holding it on one line", () => {
    const list = "HDFC Savings, ICICI Amazon Pay card, SBI Joint account, Kotak 811, Axis Flipkart card, Paytm wallet";
    render(<Row label="Outdated accounts" value={list} />);
    const value = screen.getByText(list);
    expect(value).toHaveAttribute("data-value-kind", "text");
    expect(value).not.toHaveClass("whitespace-nowrap");
    expect(value).not.toHaveClass("shrink-0");
    // Review L-I: wrapped text lines start at one edge (left-aligned); amounts stay right-aligned.
    expect(value).toHaveClass("min-w-0", "whitespace-normal", "[overflow-wrap:anywhere]", "ml-auto", "text-left");
    expect(value).not.toHaveClass("text-right");
  });
  it("keeps a long amount whole even with a long label; kind overrides the inference", () => {
    render(<>
      <Row label="Total outstanding across every card and loan this year" value="-₹12,34,56,789.00" />
      <Row label="Converted" value="USD 1,23,456.00" />
      <Row label="Count" value={1234567} />
      <Row label="Forced text" value="₹1,000" kind="text" />
      <Row label="Forced amount" value={<b>₹ 1,000 due</b>} kind="amount" />
    </>);
    for (const v of ["-₹12,34,56,789.00", "USD 1,23,456.00", "1234567"]) {
      const el = screen.getByText(v);
      expect(el, v).toHaveAttribute("data-value-kind", "amount");
      expect(el, v).toHaveClass("whitespace-nowrap", "shrink-0");
      expect(el, v).not.toHaveClass("whitespace-normal");
    }
    expect(screen.getByText("₹1,000")).not.toHaveClass("whitespace-nowrap");
    expect(screen.getByText("₹1,000")).toHaveClass("whitespace-normal");
    expect(screen.getByText("₹ 1,000 due").parentElement).toHaveClass("whitespace-nowrap");
  });
  it("text values override the global .font-mono nowrap rule (in @layer base, so a utility class wins)", () => {
    const css = readFileSync("src/styles.css", "utf8");
    const at = css.indexOf(".font-mono, .financial-amount {");
    expect(css.slice(at, css.indexOf("}", at))).toContain("white-space: nowrap");
    expect(css.lastIndexOf("@layer base", at)).toBeGreaterThan(-1);
  });
  it("infers amount vs text from the value", () => {
    for (const v of ["₹25,65,536.40", "-€1,234.50", "$1.00", "42%", "+12%", "—", "None", "INR 500.00", 7]) expect(isAmountValue(v), String(v)).toBe(true);
    for (const v of ["HDFC Savings, ICICI card", "AED report pending", "- None of these", "Groceries 95%, Dining 102%", "Sent 12 Nov 10:40", "Set a monthly contribution", "x".repeat(40)]) expect(isAmountValue(v), v).toBe(false);
  });
  it("review L-A: Intl coded-currency output (no-break space after the code, optional leading sign) is an amount", () => {
    const coded = [money(1234.5, "AED"), money(-1234567.5, "AED"), money(-1234567.5, "CHF"), money(1234.5, "USD"), money(-1234.5, "INR")];
    expect(coded[0]).toBe("AED\u00a01,234.50"); // the real output carries U+00A0, not an ordinary space
    expect(coded[1]).toBe("-AED\u00a01,234,567.50");
    for (const v of [...coded, "-AED\u00a01,234,567.50", "AED\u202f1,234.50", "+AED 12.00"]) expect(isAmountValue(v), JSON.stringify(v)).toBe(true);
    const view = render(<Row label="Converted in dirhams" value={coded[1]} />);
    const el = view.container.querySelector("[data-value-kind]")!;
    expect(el.textContent).toBe(coded[1]); // exact text, no-break space kept
    expect(el).toHaveAttribute("data-value-kind", "amount");
    expect(el).toHaveClass("whitespace-nowrap", "shrink-0", "text-right");
  });
  it("review L-B: a typographic minus or sign with a space before the figure is an amount", () => {
    for (const v of ["− ₹1,234.00", "−₹1,234.00", "+ ₹50.00", "− USD 1,234.00", `−\u00a0${money(1234)}`]) expect(isAmountValue(v), JSON.stringify(v)).toBe(true);
    render(<Row label="Refund reversed" value="− ₹1,234.00" />);
    expect(screen.getByText("− ₹1,234.00")).toHaveAttribute("data-value-kind", "amount");
  });
});
