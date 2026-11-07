import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { checkInviteEmail } from "./family-requests";
const invites = [{ id: "a", email: "nidhi.kkn@gmail.com" }, { id: "b", email: "x@y.com" }];
describe("editing an invite email", () => {
  it("rejects an invalid email", () => { expect(() => checkInviteEmail("nidhi@", "a", invites)).toThrow(/valid email/); });
  it("rejects an email used by another member", () => { expect(() => checkInviteEmail("X@Y.com", "a", invites)).toThrow(/already used/); });
  it("accepts a corrected email, normalised", () => { expect(checkInviteEmail(" Nidhi.KKN@gmail.com ", "a", invites)).toBe("nidhi.kkn@gmail.com"); });
});
