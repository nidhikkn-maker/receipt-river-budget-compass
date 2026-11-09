import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/lib/store", () => ({ useStore: () => ({ userId: "admin" }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn(async () => ({ data: [], error: null })), from: () => ({ select: () => ({ order: () => ({ limit: async () => ({ data: [] }) }) }) }) } }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: [] }), useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@/lib/team-access", async (orig) => ({ ...(await orig<typeof import("@/lib/team-access")>()), useTeamAccess: () => ({ data: { admin: true, role: "finance", switches: [] } }) }));
import { TeamAccessSettings } from "./TeamAccess";
afterEach(cleanup);

it("describes team access accurately: only explicitly shared companies, never personal records", () => {
  render(<TeamAccessSettings />);
  expect(screen.getByText(/Team roles only see companies the owner has explicitly shared with them\. Personal records are never shared\./)).toBeInTheDocument();
  expect(screen.queryByText(/finance on everyone/i)).toBeNull();
  expect(screen.queryByText(/Managers act on their own department/i)).toBeNull();
});
