import { describe, expect, it } from "vitest";
import { relyingPartyFor, DEFAULT_PASSKEY_ORIGINS } from "./passkey-origin";

const prod = { NODE_ENV: "production" };
const refused = "Passkeys are not available on this address";

describe("passkey relying party allowlist (security review M-3)", () => {
  it("accepts the production origin with its own hostname as RP ID", () => {
    expect(relyingPartyFor("https://ledgerline.biz", prod)).toEqual({ origin: "https://ledgerline.biz", rpID: "ledgerline.biz" });
  });
  it("shares one registrable RP ID across apex and www when PASSKEY_RP_ID is set", () => {
    expect(relyingPartyFor("https://www.ledgerline.biz", { ...prod, PASSKEY_RP_ID: "ledgerline.biz" })).toEqual({ origin: "https://www.ledgerline.biz", rpID: "ledgerline.biz" });
  });
  it("refuses origins that are not allowlisted, including other lovable.app apps", () => {
    for (const o of ["https://evil.example", "https://someone-else.lovable.app", "https://ledgerline.biz.evil.example"]) expect(() => relyingPartyFor(o, prod)).toThrow(refused);
  });
  it("refuses http, paths, malformed values and a missing header", () => {
    expect(() => relyingPartyFor("http://ledgerline.biz", prod)).toThrow(refused);
    expect(() => relyingPartyFor("https://ledgerline.biz/path", prod)).toThrow(refused);
    expect(() => relyingPartyFor("not a url", prod)).toThrow(refused);
    expect(() => relyingPartyFor(null, prod)).toThrow("Open this app in your browser");
  });
  it("allows localhost only outside production", () => {
    expect(() => relyingPartyFor("http://localhost", prod)).toThrow(refused);
    expect(relyingPartyFor("http://localhost", { NODE_ENV: "development" })).toEqual({ origin: "http://localhost", rpID: "localhost" });
  });
  it("uses an exact configured preview host and ignores wildcard entries", () => {
    const env = { ...prod, PASSKEY_ALLOWED_ORIGINS: "https://ledgerline.biz, https://*.lovable.app, https://id-preview--abc.lovable.app" };
    expect(relyingPartyFor("https://id-preview--abc.lovable.app", env).rpID).toBe("id-preview--abc.lovable.app");
    expect(() => relyingPartyFor("https://other.lovable.app", env)).toThrow(refused);
  });
  it("never lets PASSKEY_RP_ID widen an unrelated host", () => {
    const env = { ...prod, PASSKEY_ALLOWED_ORIGINS: "https://id-preview--abc.lovable.app", PASSKEY_RP_ID: "ledgerline.biz" };
    expect(relyingPartyFor("https://id-preview--abc.lovable.app", env).rpID).toBe("id-preview--abc.lovable.app");
  });
  it("defaults contain only exact https origins", () => {
    for (const o of DEFAULT_PASSKEY_ORIGINS) { expect(o.startsWith("https://")).toBe(true); expect(o).not.toContain("*"); expect(new URL(o).origin).toBe(o); }
  });
});
