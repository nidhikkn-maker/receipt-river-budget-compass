import { describe, expect, it } from "vitest";
import { identifyFile, detectAccountDetails } from "./identify";
import { newAccountFromHint } from "./apply";

const header = ["City Union Bank Ltd", "Statement of Account", "Customer Name : KRUPANIDHI K", "Account Type : Savings Account", "Account Number : 143001001024894", "IFSC Code : CIUB0000143"];

describe("Statement from an account the app doesn't have yet", () => {
  it("reads bank, last four, IFSC, holder and type from labelled header lines", () => {
    const id = identifyFile(header, [], []);
    expect(id.accountId).toBeNull();
    expect(id.hint).toMatchObject({ issuer: "City Union Bank", kind: "savings", lastFour: "4894", ifsc: "CIUB0000143", holder: "KRUPANIDHI K", number: "143001001024894" });
  });
  it("recognises a current account and an unlisted bank printed in the header", () => {
    expect(detectAccountDetails(["Account Type: Current Account"]).kind).toBe("current");
    expect(identifyFile(["Saraswat Co-operative Bank", "Account No: 0012345678"], [], []).hint?.issuer).toBe("Saraswat Co-operative Bank");
  });
  it("starts the new account from the printed opening balance, never an invented one", () => {
    const hint = identifyFile(header, [], []).hint!;
    expect(newAccountFromHint(hint, 52340.5).openingBalance).toBe(52340.5);
    expect(newAccountFromHint(hint, null).openingBalance).toBe(0);
    expect(newAccountFromHint(hint, null).details).toMatchObject({ matchRefs: ["143001001024894", "4894"] });
  });
  it("uses an existing account with the same last four instead of a new one", () => {
    const acc = { id: "a1", name: "CUB savings", kind: "savings", lastFour: "4894", archived: false } as never;
    expect(identifyFile(header, [], [acc]).accountId).toBe("a1");
  });
});
