import { describe, expect, it } from "vitest";
import { candidateDays, latestByIsin, parseBhavcopy } from "./bhavcopy";

const HEAD = "TradDt,BizDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs,XpryDt,FininstrmActlXpryDt,StrkPric,OptnTp,FinInstrmNm,OpnPric,HghPric,LwPric,ClsPric,LastPric,PrvsClsgPric";
describe("closing price files", () => {
  it("reads ISIN, symbol and close from the official layout", () => {
    const rows = parseBhavcopy(`${HEAD}\n2026-11-02,2026-11-02,CM,BSE,STK,500002,INE117A01022,ABB,A,,,,,ABB INDIA LIMITED,6400.00,6587.45,6334.90,6571.60,6585.00,6403.00`, "BSE");
    expect(rows).toEqual([{ exchange: "BSE", symbol: "ABB", isin: "INE117A01022", series: "A", name: "ABB INDIA LIMITED", close: 6571.6, prevClose: 6403, date: "2026-11-02" }]);
  });
  it("skips zero prices and rejects an unknown layout", () => {
    expect(parseBhavcopy(`${HEAD}\n2026-11-02,,CM,NSE,STK,1,INE000000001,X,EQ,,,,,X,0,0,0,0,0,0`, "NSE")).toEqual([]);
    expect(() => parseBhavcopy("a,b\n1,2", "NSE")).toThrow();
  });
  it("prefers the newest date, then NSE on the same date", () => {
    const m = latestByIsin([
      { exchange: "BSE", isin: "INE1", close: 10, price_date: "2026-11-02", symbol: "A" },
      { exchange: "NSE", isin: "INE1", close: 11, price_date: "2026-11-02", symbol: "A" },
      { exchange: "NSE", isin: "INE1", close: 9, price_date: "2026-10-30", symbol: "A" },
    ]);
    expect(m.get("INE1")).toMatchObject({ exchange: "NSE", close: 11, date: "2026-11-02" });
  });
  it("never tries weekends and waits for the evening file", () => {
    const days = candidateDays(new Date("2026-11-02T06:00:00Z"), 2).map((d) => d.toISOString().slice(0, 10)); // Monday 11:30 IST
    expect(days).toEqual(["2026-10-30", "2026-10-29"]);
  });
});
