import { describe, expect, it } from "vitest";
import { buildPortfolio } from "./portfolio";
import type { Account, Txn, Valuation } from "./ledger";

const fund: Account = { id: "fund", name: "Axis ELSS", kind: "investment", openingBalance: 0, archived: false };
const nav = (valuedOn: string, value: number, accountId = "fund"): Valuation => ({ accountId, valuedOn, value, source: "MFapi / AMFI NAV" });
const run = (vals: Valuation[], txns: Txn[] = [], accounts = [fund]) => buildPortfolio(accounts, txns, vals, { asOf: "2026-10-31" });

describe("NAV portfolio values and gains", () => {
  it("charts dated values and gain from the first saved NAV, not a fabricated cost basis", () => {
    const p = run([nav("2026-10-01", 10000), nav("2026-10-30", 13405.87)]);
    expect(p.points.map(x => [x.date, x.value, x.gain])).toEqual([["2026-10-01",10000,0],["2026-10-30",13405.87,3405.87],["2026-10-31",13405.87,3405.87]]);
  });
  it("does not count an investment purchase as gain", () => {
    const p = run([nav("2026-10-01",10000),nav("2026-10-30",16000)], [{id:"buy",txnType:"transfer",amount:5000,date:"2026-10-15",accountId:"bank",toAccountId:"fund"}]);
    expect(p.holdings[0]).toMatchObject({value:16000,netFlows:5000,gain:1000,reference:15000});
    expect(p.points.find(x => x.date === "2026-10-15")?.gain).toBe(0);
  });
  it("does not turn redemption into a market loss", () => {
    const p = run([nav("2026-10-01",10000),nav("2026-10-30",8500)], [{id:"sell",txnType:"transfer",amount:2000,date:"2026-10-15",accountId:"fund",toAccountId:"bank"}]);
    expect(p.holdings[0]).toMatchObject({netFlows:-2000,gain:500});
  });
  it("adds a newly tracked fund without treating its opening NAV as profit", () => {
    const other = {...fund,id:"other",name:"Other fund"};
    const p=run([nav("2026-10-01",10000),nav("2026-10-30",11000),nav("2026-10-20",20000,"other")],[],[fund,other]);
    expect(p.points[0]).toMatchObject({value:10000,fundCount:1});
    expect(p.holdings.reduce((s,h)=>s+h.gain,0)).toBe(1000);
    expect(p.points.at(-1)).toMatchObject({value:31000,gain:1000,fundCount:2});
  });
  it("keeps the original gain baseline when filtering dates and excludes future NAVs", () => {
    const p=buildPortfolio([fund],[],[nav("2026-10-01",10000),nav("2026-10-20",11000),nav("2026-11-01",99999)],{asOf:"2026-10-31",from:"2026-10-25",to:"2026-12-01"});
    expect(p.points[0]).toMatchObject({date:"2026-10-25",value:11000,gain:1000});
    expect(p.holdings[0].latestDate).toBe("2026-10-20");
  });
  it("does not double count same-day snapshots or flows already included in that day's NAV", () => {
    const p=run([nav("2026-10-01",12000),nav("2026-10-01",10000),nav("2026-10-30",13000)],[{id:"buy",txnType:"transfer",amount:2000,date:"2026-10-01",toAccountId:"fund"}]);
    expect(p.holdings[0]).toMatchObject({baseline:12000,value:13000,netFlows:0,gain:1000});
  });
  it("filters to one fund and excludes archived and non-NAV assets", () => {
    const p=buildPortfolio([fund,{...fund,id:"archived",archived:true},{...fund,id:"manual"}],[],[nav("2026-10-01",10000),nav("2026-10-01",50000,"archived"),{accountId:"manual",value:90000,valuedOn:"2026-10-01",source:"manual"}],{asOf:"2026-10-31",accountId:"fund"});
    expect(p.holdings.map(h=>h.accountId)).toEqual(["fund"]);
    expect(p.points.at(-1)?.value).toBe(10000);
  });
  it("shows genuine negative gains", () => expect(run([nav("2026-10-01",10000),nav("2026-10-30",9000)]).holdings[0].gain).toBe(-1000));
  it("returns empty for missing snapshots, invalid dates or reversed ranges", () => {
    expect(run([]).points).toEqual([]);
    expect(run([nav("2026-02-30",10000)]).points).toEqual([]);
    expect(buildPortfolio([fund],[],[nav("2026-10-01",10000)],{asOf:"2026-10-31",from:"2026-10-30",to:"2026-10-01"}).points).toEqual([]);
  });
});