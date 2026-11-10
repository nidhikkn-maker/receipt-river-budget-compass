// Shared Signature Flow kit: states, list/detail, search palette focus return. Isolated store stand-in.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const local = vi.hoisted(() => ({ store: {} as Record<string, unknown> }));
vi.mock("@/lib/store", () => ({ useStore: () => local.store }));
vi.mock("@tanstack/react-router", async () => {
  const { MockLink } = await import("./test-router-mock");
  return { Link: MockLink, useNavigate: () => () => {} };
});

import { EmptyState, ErrorState, LoadingState, OfflineState, ProposedBadge, StaleState, UnauthorizedState, UnsavedDraftState } from "./States";
import { SplitView } from "./SplitView";
import { SearchPalette } from "./SearchPalette";

afterEach(cleanup);

describe("states kit", () => {
  it("loading is announced and busy", () => {
    render(<LoadingState label="Loading accounts" />);
    const s = screen.getByRole("status");
    expect(s).toHaveAttribute("aria-busy", "true");
    expect(s).toHaveTextContent("Loading accounts");
  });
  it("empty names the next useful action", () => {
    render(<EmptyState title="No accounts yet" hint="Upload a statement" action={<button type="button">Upload</button>} />);
    expect(screen.getByText("No accounts yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload" })).toBeInTheDocument();
  });
  it("error reuses LoadError: says nothing was deleted and retries", async () => {
    const retry = vi.fn();
    render(<ErrorState what="your accounts" onRetry={retry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load your accounts.");
    expect(screen.getByRole("alert")).toHaveTextContent("Nothing has been deleted");
    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    await waitFor(() => expect(retry).toHaveBeenCalledTimes(1));
  });
  it("offline says what is shown and what waits", () => {
    render(<OfflineState waiting={2} />);
    expect(screen.getByRole("status")).toHaveTextContent("You're offline");
    expect(screen.getByRole("status")).toHaveTextContent("2 changes waiting to sync");
  });
  it("unauthorized explains without revealing content", () => {
    render(<UnauthorizedState what="Thapal Ventures" />);
    expect(screen.getByRole("alert")).toHaveTextContent("You don't have access to Thapal Ventures");
    expect(screen.getByRole("link", { name: "Go to Home" })).toHaveAttribute("href", "/home");
  });
  it("stale shows the age and refreshes", async () => {
    const refresh = vi.fn();
    render(<StaleState asOf="8 Nov 2026" onRefresh={refresh} />);
    expect(screen.getByRole("status")).toHaveTextContent("Last updated 8 Nov 2026.");
    fireEvent.click(screen.getByRole("button", { name: /Refresh/ }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
  it("unsaved draft offers resume and an explicit discard", async () => {
    const resume = vi.fn(); const discard = vi.fn();
    render(<UnsavedDraftState label="Taj invoice" onResume={resume} onDiscard={discard} />);
    expect(screen.getByRole("status")).toHaveTextContent("Saved as a draft");
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard draft" }));
    await waitFor(() => { expect(resume).toHaveBeenCalled(); expect(discard).toHaveBeenCalled(); });
  });
  it("proposed badge is plain text", () => {
    render(<ProposedBadge />);
    expect(screen.getByText("Proposed")).toBeInTheDocument();
  });
});

function Split() {
  const [sel, setSel] = useState<string | null>(null);
  return <SplitView label="Accounts" items={[{ id: "a", title: "HDFC Savings" }, { id: "b", title: "ICICI Current" }]} selectedId={sel} onSelect={setSel} renderDetail={(id) => <p>Detail for {id}</p>} empty={<p>none</p>} />;
}

describe("list/detail template", () => {
  it("opens the detail beside the list, marks the row, and Back returns focus to that row", async () => {
    render(<Split />);
    expect(screen.getByText("Choose an item to see its details here.")).toBeInTheDocument();
    const row = screen.getByRole("button", { name: /ICICI Current/ });
    row.focus();
    fireEvent.click(row);
    expect(screen.getByText("Detail for b")).toBeInTheDocument();
    expect(row).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("region", { name: "ICICI Current" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to accounts" }));
    expect(screen.queryByText("Detail for b")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(row));
  });
  it("shows the empty state when there is nothing to list", () => {
    render(<SplitView label="Accounts" items={[]} selectedId={null} onSelect={() => {}} renderDetail={() => null} empty={<p>none yet</p>} />);
    expect(screen.getByText("none yet")).toBeInTheDocument();
  });
});

function PaletteHost() {
  const [open, setOpen] = useState(false);
  return <><button type="button" onClick={() => setOpen(true)}>Find anything</button><SearchPalette open={open} onOpenChange={setOpen} /></>;
}

describe("search palette", () => {
  it("groups existing search results and returns focus to the opener on close", async () => {
    local.store = {
      transactions: [{ id: "t1", title: "Taj Mahal Palace", merchant: "Taj Hotels", category: "Travel", amount: 38400, date: "2026-11-08", txnType: "expense", tags: [] }],
      accounts: [], commitments: [], loans: [], documents: [], goals: [],
    };
    render(<PaletteHost />);
    const opener = screen.getByRole("button", { name: "Find anything" });
    opener.focus();
    fireEvent.click(opener);
    const box = await screen.findByRole("searchbox", { name: "Find anything" });
    fireEvent.change(box, { target: { value: "taj" } });
    expect(await screen.findByRole("region", { name: "Transactions" })).toHaveTextContent("Taj Mahal Palace");
    fireEvent.keyDown(box, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
});
