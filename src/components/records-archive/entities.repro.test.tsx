// P0-011 regression (was repro): a company profile is archived, never deleted; its tax years and account links are kept,
// merge archives the merged-away profile instead of removing it, and restore brings it back unchanged.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { bare, confirmInDialog, harness, OWNER, reset } from "./harness";

vi.mock("@/lib/store", async () => ({ useStore: (await import("./harness")).useStoreMock }));
vi.mock("@tanstack/react-router", async () => (await import("./harness")).routerMock);
vi.mock("@/components/AppShell", () => ({ PageTitle: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock("@/components/books/CompanyTaxProfile", () => ({ CompanyTaxProfile: () => null }));
vi.mock("@/components/books/CompanyAccess", () => ({ CompanyAccess: () => null, SharedWithMe: () => null }));
vi.mock("@/lib/confirm", () => ({ confirmAction: vi.fn(async () => true) }));
import { Route } from "@/routes/_authenticated/entities";
const Entities = (Route as unknown as { component: () => React.ReactElement }).component;

const co = { id: "ent-1", name: "Thapal Ventures Pvt Ltd", kind: "company", pan: "AAACT1234F", gstins: ["33AAACT1234F1Z5"], booksFrom: "2024-25", address: "Anna Salai, Chennai" };
const co2 = { id: "ent-2", name: "Thapal Holdings LLP", kind: "llp", pan: "AAAFT1234F", gstins: [], booksFrom: "2024-25" };
const years = [{ id: "y1", entityId: "ent-1", fy: "2025-26", bookProfit: 420000 }, { id: "y2", entityId: "ent-1", fy: "2024-25", bookProfit: 100 }, { id: "y3", entityId: "ent-2", fy: "2024-25", bookProfit: 5 }];
const links = { "ent-1": ["bank-1"], "ent-2": ["bank-2"] };
beforeEach(() => reset({ entities: [co, co2], books: { entityAccounts: links, entityTaxProfiles: years } }, { accounts: [{ id: "bank-1", name: "HDFC current", kind: "current", openingBalance: 0, archived: false }, { id: "bank-2", name: "ICICI current", kind: "current", openingBalance: 0, archived: false }] }));
afterEach(cleanup);
const ents = () => harness.stored["entities"] as Record<string, unknown>[];
const books = () => harness.stored["books"] as Record<string, unknown>;

describe("P0-011 company profiles: archive instead of delete", () => {
  it("offers no Delete; Archive keeps the profile, tax years and account links; restore brings it back", async () => {
    render(<Entities />);
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Archive" })[0]!);
    expect(await confirmInDialog("Company struck off; kept for records", /^Archive profile$/)).toBe("Archive this profile?");
    expect(ents()).toHaveLength(2);
    expect(bare(ents()[0])).toEqual(co);
    expect(ents()[0]).toMatchObject({ archivedBy: OWNER, archiveReason: "Company struck off; kept for records" });
    expect(books()["entityTaxProfiles"]).toEqual(years);
    expect(books()["entityAccounts"]).toEqual(links);
    // Archived profile leaves the active list but its record and history are shown (archive fields survive normalisation).
    expect(screen.getByText(/^Archived profiles \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/1 linked account · 2 tax year record/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `Restore ${co.name}` }));
    await confirmInDialog("Archived by mistake", /^Restore profile$/);
    expect(bare(ents()[0])).toEqual(co);
    expect((ents()[0]!["archiveHistory"] as { action: string }[]).map((e) => e.action)).toEqual(["archived", "restored"]);
    expect(books()["entityTaxProfiles"]).toEqual(years);
  });

  it("merge moves accounts and free years, archives the merged-away profile and keeps a clashing year", async () => {
    render(<Entities />);
    fireEvent.change(screen.getAllByLabelText("Merge into")[1]!, { target: { value: "ent-1" } });
    await vi.waitFor(() => expect(harness.saves).toBe(1));
    expect(ents()).toHaveLength(2);
    expect(bare(ents()[1])).toEqual(co2);
    expect(ents()[1]).toMatchObject({ archiveReason: `Merged into ${co.name}`, archivedBy: OWNER });
    expect(books()["entityAccounts"]).toEqual({ "ent-1": ["bank-1", "bank-2"] });
    // ent-1 already had 2024-25, so ent-2's 2024-25 stays with the archived profile instead of being dropped.
    expect(books()["entityTaxProfiles"]).toEqual(years);
  });
});
