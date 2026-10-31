import { describe,expect,it } from "vitest";
import { queueEntry,pendingEntries,removePending,putSnapshot,getSnapshot } from "./offline";
import { indexedDB } from "fake-indexeddb";
globalThis.indexedDB = indexedDB;
describe("Offline entry isolation",()=>{
  it("retains an entry under its owner and stable id",async()=>{
    await queueEntry({id:"stable-entry",owner:"owner-a",createdAt:"2026-10-31",files:[],input:{title:"Offline dinner",merchant:null,amount:2500,currency:"INR",date:"2026-10-31",category:"Dining",scope:"personal",memberId:null,paymentMethod:"cash",description:""}});
    expect((await pendingEntries("owner-a")).map(e=>e.id)).toEqual(["stable-entry"]);
    expect(await pendingEntries("owner-b")).toEqual([]);
    await removePending("stable-entry");expect(await pendingEntries("owner-a")).toEqual([]);
  });
  it("does not share cached financial records across accounts",async()=>{
    await putSnapshot("owner-a",{balance:2500});expect(await getSnapshot("owner-a")).toEqual({balance:2500});expect(await getSnapshot("owner-b")).toBeUndefined();
  });
});