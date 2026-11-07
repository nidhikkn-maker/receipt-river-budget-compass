import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ReportDocumentVerification } from "./ReportDocumentVerification";
afterEach(cleanup);
it("required missing evidence refuses final generation and cancellation creates no report", () => {
  const decision = vi.fn();
  render(<ReportDocumentVerification required rows={[{ id: "1", title: "Bill", error: "File unavailable or empty" }]} onDecision={decision} />);
  expect(screen.getByRole("button", { name: "Confirm documents & generate" })).toBeDisabled();
  expect(decision).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(decision).toHaveBeenCalledWith(false);
});
it("optional missing evidence needs an explicit decision before generating", () => {
  const decision = vi.fn();
  render(<ReportDocumentVerification required={false} rows={[{ id: "1", title: "Original", error: null }, { id: "2", title: "Missing bill", error: "No supporting bill attached" }]} onDecision={decision} />);
  expect(decision).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm documents & generate" }));
  expect(decision).toHaveBeenCalledWith(true);
});