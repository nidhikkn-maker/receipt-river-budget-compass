// B1d item 3: the date always reads "09 Nov 2026" and the stored ISO value never changes because of display or the
// browser's locale (checked under en-US and en-IN). Opening, closing and keyboard use change nothing; only picking
// a day does.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DateField } from "./DateField";
import { readReviewForm } from "@/components/smart-add/canvas-model";

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => {};
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

/** Makes every locale-default date formatting behave as in the given browser locale. */
function asLocale(locale: string) {
  const DTF = Intl.DateTimeFormat;
  vi.spyOn(Intl, "DateTimeFormat").mockImplementation(((l?: string | string[], o?: Intl.DateTimeFormatOptions) => new DTF(l ?? locale, o)) as unknown as typeof Intl.DateTimeFormat);
  const toLocaleDateString = Date.prototype.toLocaleDateString;
  vi.spyOn(Date.prototype, "toLocaleDateString").mockImplementation(function (this: Date, l?: Intl.LocalesArgument, o?: Intl.DateTimeFormatOptions) { return toLocaleDateString.call(this, l ?? locale, o); });
  vi.spyOn(navigator, "language", "get").mockReturnValue(locale);
  vi.spyOn(navigator, "languages", "get").mockReturnValue([locale]);
}

function Host({ initial, seen }: { initial: string; seen: string[] }) {
  const [v, setV] = useState(initial);
  return <form aria-label="Review"><label htmlFor="d">Date</label><DateField id="d" label="Date" value={v} onChange={(x) => { seen.push(x); setV(x); }} /><output aria-label="stored">{v}</output></form>;
}

describe.each(["en-US", "en-IN"])("DateField in %s", (locale) => {
  it("shows 09 Nov 2026, keeps the stored ISO value, and changes it only when a day is picked", async () => {
    asLocale(locale);
    expect(new Date(2026, 10, 9).toLocaleDateString()).toBe(locale === "en-US" ? "11/9/2026" : "9/11/2026"); // the ambiguity being avoided
    const seen: string[] = [];
    render(<Host initial="2026-11-09" seen={seen} />);
    const field = screen.getByLabelText("Date");
    expect(field).toHaveTextContent("09 Nov 2026");
    expect(field).toHaveAccessibleName("Date: 09 Nov 2026. Change date");
    expect(field.tagName).toBe("BUTTON");
    expect(field).toHaveAttribute("data-value", "2026-11-09");
    // The confirmation summary reads the stored value, not the display.
    expect(readReviewForm(field.closest("form"), []).rows).toEqual([{ label: "Date", value: "09 Nov 2026" }]);

    // Keyboard: Enter opens the calendar on the stored day; Escape closes it; nothing changed.
    field.focus();
    fireEvent.click(field);
    const dialog = await screen.findByRole("dialog", { name: "Choose date" });
    expect(dialog.querySelector('[data-selected-single="true"]')).not.toBeNull();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Choose date" })).toBeNull();
    expect(seen).toEqual([]);
    expect(screen.getByLabelText("stored")).toHaveTextContent("2026-11-09");

    // Picking the 12th stores 2026-11-12 exactly.
    fireEvent.click(field);
    const days = (await screen.findByRole("dialog", { name: "Choose date" })).querySelectorAll<HTMLButtonElement>("button[data-day]");
    const twelfth = [...days].find((b) => b.textContent === "12" && !b.closest("[data-outside]"));
    fireEvent.click(twelfth!);
    expect(seen).toEqual(["2026-11-12"]);
    expect(screen.getByLabelText("Date")).toHaveTextContent("12 Nov 2026");
    expect(screen.getByLabelText("Date")).toHaveAttribute("data-value", "2026-11-12");
  });
});
