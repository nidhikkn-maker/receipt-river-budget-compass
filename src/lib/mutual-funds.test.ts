import { describe, expect, it } from "vitest";
import { fundHoldingValue, parseFundQuote } from "./mutual-funds";

const response = { status: "SUCCESS", meta: { scheme_code: 120503, scheme_name: "Axis ELSS Direct Growth" }, data: [{ date:"30-10-2026", nav:"106.81970" }] };
describe("Dated mutual fund valuations", () => {
 it("keeps the published NAV date on a non-trading day", () => expect(parseFundQuote(response,"120503","2026-10-31")).toEqual({schemeCode:"120503",schemeName:"Axis ELSS Direct Growth",date:"2026-10-30",nav:106.8197}));
 it("calculates units times NAV rounded to paise", () => expect(fundHoldingValue(125.5,106.8197)).toBe(13405.83));
 it("rejects a different scheme", () => expect(() => parseFundQuote(response,"100001","2026-10-31")).toThrow("different fund"));
 it("rejects impossible publication dates", () => expect(() => parseFundQuote({...response,data:[{date:"30-02-2026",nav:"100"}]},"120503","2026-10-31")).toThrow());
 it("rejects future publication dates", () => expect(() => parseFundQuote(response,"120503","2026-10-29")).toThrow());
 it("rejects missing and zero NAVs", () => expect(() => parseFundQuote({...response,data:[{date:"30-10-2026",nav:"0"}]},"120503","2026-10-31")).toThrow());
 it("rejects non-finite or negative units", () => { for(const units of [NaN,Infinity,-1,0]) expect(() => fundHoldingValue(units,100)).toThrow(); });
});