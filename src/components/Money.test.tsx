// Density audit SH-8/SH-9: a key-value money row keeps the amount on one line and lets it drop to its own
// right-aligned line beside a long label, instead of squeezing the label into a narrow column.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Row } from "./Money";

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
});
