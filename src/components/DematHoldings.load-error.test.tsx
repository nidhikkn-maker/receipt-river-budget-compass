// P0-004 regression. Before the fix a failed holdings read showed "No holdings yet"
// (evidence: docs/evidence/screens/2026-11-09-p0-evidence/repro-DematHoldings.before.tsx.txt).
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/lib/investments/holdings-store", () => ({ loadDemat: h.load }));
vi.mock("@/lib/smart-add-event", () => ({ openSmartAdd: vi.fn() }));
import { DematHoldings } from "./DematHoldings";
afterEach(() => { cleanup(); h.load.mockReset(); });
it("a failed holdings read shows an error with Retry, never 'No holdings yet'; Retry loads the holdings", async () => {
  h.load.mockRejectedValueOnce(new Error("Could not connect to the database"));
  render(<DematHoldings />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load your demat holdings.");
  expect(screen.queryByText(/No holdings yet/)).toBeNull();
  h.load.mockResolvedValueOnce([{ id: "d1", broker: "Zerodha", dpId: "IN300", clientId: "C1", holder: "KK", holdings: [{ id: "h1", isin: "INE002A01018", name: "Reliance", quantity: 10, asOf: "2026-10-31", statementValue: null, lots: [] }] }]);
  fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
  expect(await screen.findByText("Reliance")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).toBeNull();
});
it("a genuinely empty result still shows the empty state", async () => {
  h.load.mockResolvedValueOnce([]);
  render(<DematHoldings />);
  expect(await screen.findByText(/No holdings yet/)).toBeInTheDocument();
});
