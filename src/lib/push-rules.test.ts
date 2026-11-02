import { describe, expect, it } from "vitest";
import { paymentReminderItems, privateReminderPayload, pushSubscriptionSchema, validPushEndpoint } from "./push-rules";
import type { Commitment } from "./planning";
import type { Account, Txn } from "./ledger";

const bill: Commitment={id:"rent",name:"Private rent",kind:"rent",direction:"out",amount:1000,frequency:"monthly",intervalDays:null,nextDue:"2026-11-03",accountId:null,category:"Rent",confirmed:true,essential:true,status:"active"};
const base={today:"2026-10-31",leadDays:3,enabled:true,commitments:[bill],loans:[],accounts:[],transactions:[],documents:[]};
describe("Private payment notifications",()=>{
  it("uses the saved three-day advance window inclusively",()=>{
    expect(paymentReminderItems({...base,commitments:[bill,{...bill,id:"later",nextDue:"2026-11-04"}]}).map(x=>x.key)).toEqual(["commitment:rent:2026-11-03"]);
  });
  it("zero-day lead includes only today and overdue",()=>{
    expect(paymentReminderItems({...base,leadDays:0,commitments:[bill,{...bill,id:"today",nextDue:base.today},{...bill,id:"late",nextDue:"2026-10-30"}]}).map(x=>x.key)).toEqual(["commitment:late:2026-10-30","commitment:today:2026-10-31"]);
  });
  it("never sends when saved reminders are off",()=>expect(paymentReminderItems({...base,enabled:false})).toEqual([]));
  it("excludes received income, paused and paid/completed items",()=>expect(paymentReminderItems({...base,commitments:[{...bill,direction:"in"},{...bill,status:"paused"},{...bill,status:"completed"}]})).toEqual([]));
  it("includes loan EMIs but not closed loans or card EMIs already included in billing",()=>{
    const loan={id:"loan",name:"Loan",principal:10000,rate:10,emi:1000,nextDue:"2026-11-01",loanType:"personal",status:"active"};
    expect(paymentReminderItems({...base,commitments:[],loans:[loan,{...loan,id:"closed",status:"closed"},{...loan,id:"card",loanType:"credit_card_emi"}]}).map(x=>x.key)).toEqual(["loan:loan:2026-11-01"]);
  });
  it("includes document expiry without sending document contents",()=>{
    expect(paymentReminderItems({...base,commitments:[],documents:[{id:"insurance",expiresOn:"2026-11-02"},{id:"no-date",expiresOn:null}]})).toEqual([{key:"document:insurance:2026-11-02",date:"2026-11-02",kind:"document"}]);
  });
  it("uses the remaining card statement bill and stops after it is paid",()=>{
    const card:Account={id:"card",name:"Private card",kind:"credit_card",openingBalance:0,archived:false,statementDay:25,dueDay:2};
    const purchase:Txn={id:"buy",txnType:"expense",amount:5000,accountId:"card",date:"2026-10-20"};
    const input={...base,commitments:[],accounts:[card],transactions:[purchase]};
    expect(paymentReminderItems(input).map(x=>x.key)).toEqual(["card:card:2026-11-02"]);
    expect(paymentReminderItems({...input,transactions:[purchase,{id:"pay",txnType:"transfer",amount:5000,accountId:"bank",toAccountId:"card",date:"2026-10-26"}]})).toEqual([]);
  });
  it("notifications contain only a generic count, no names or balances",()=>{
    expect(privateReminderPayload(2)).toEqual({title:"Ledgerline",body:"2 payment or renewal reminders to review.",url:"/plan",tag:"ledgerline-reminders"});
  });
});
describe("Outbound push safety",()=>{
  it("accepts only known HTTPS browser push services",()=>{
    for(const url of ["https://fcm.googleapis.com/fcm/send/abc","https://updates.push.services.mozilla.com/wpush/v2/a","https://web.push.apple.com/a","https://wns2.notify.windows.com/a"])expect(validPushEndpoint(url)).toBe(true);
  });
  it("rejects private hosts, arbitrary HTTPS, credentials, ports and lookalike domains",()=>{
    for(const url of ["http://fcm.googleapis.com/a","https://127.0.0.1/a","https://example.com/a","https://fcm.googleapis.com.evil.com/a","https://user:pass@fcm.googleapis.com/a","https://fcm.googleapis.com:8443/a"])expect(validPushEndpoint(url)).toBe(false);
  });
  it("rejects malformed browser encryption keys",()=>expect(pushSubscriptionSchema.safeParse({endpoint:"https://fcm.googleapis.com/a",keys:{p256dh:"bad",auth:"bad"}}).success).toBe(false));
});
import { tripReminderItems } from "./push-rules";
describe("trip reminders", () => {
  const trip = { id: "t", itinerary: [{ id: "a", date: "2026-05-01" }, { id: "b", date: "2026-05-05" }], bookings: [{ id: "h", date: "2026-05-02", status: "unpaid", kind: "hotel" }, { id: "x", date: "2026-05-01", status: "cancelled", kind: "flight" }] };
  it("includes plans and check-ins for today and tomorrow only", () => {
    expect(tripReminderItems([trip], "2026-05-01").map((i) => i.key)).toEqual(["trip-plan:t:a:2026-05-01", "trip-checkin:t:h:2026-05-02"]);
  });
  it("skips closed or cancelled trips", () => {
    expect(tripReminderItems([{ ...trip, closedAt: "x" }, { ...trip, cancelledAt: "y" }], "2026-05-01")).toEqual([]);
  });
});
