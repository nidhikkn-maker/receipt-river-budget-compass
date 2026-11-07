// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { dispatchPaymentReminders, dispatchCheckInReminders } from "./push-dispatch.server";
const send = vi.hoisted(() => vi.fn());
vi.mock("./push-crypto.server", () => ({ sendDevicePush: send }));

function fakeDatabase() {
  const claims = new Set(["device:phone"]); // ordinary reminder already delivered today
  const state = { amount: 313900 };
  const rows: Record<string, unknown> = {
    push_subscriptions: [{id:"phone",owner_id:"owner",last_sent_at:"2026-11-04T00:00:00Z"}],
    finance_preferences: {data:{reminders:true,reminderDays:3,notifications:{payments:false,checkIns:false}}},
    commitments: [{id:"emi",name:"Mercedes GLS",kind:"emi",direction:"out",amount:313913,frequency:"monthly",next_due:"2026-11-05",account_id:"cub",status:"active"}],
    loans: [{id:"gls",name:"Mercedes GLS",principal_outstanding:1000000,annual_rate:8.25,emi:313913,next_due:"2026-11-05",account_id:"loan",loan_type:"vehicle",status:"active",payments:[]}],
    accounts: [{id:"cub",name:"CUB",kind:"savings",opening_balance:0,archived:false,details:{fundsLoan:"gls",fundedFrom:"idfc",fundingDay:3}},{id:"loan",name:"Loan",kind:"loan",opening_balance:1000000,archived:false,details:{}}],
    documents: [],
  };
  const db = {from(table:string) {
    let result: unknown = {data:table === "expenses" ? [{id:"fund",txn_type:"transfer",amount:state.amount,account_id:"idfc",to_account_id:"cub",expense_date:"2026-11-03"}] : rows[table],error:null};
    const query = {
      select:()=>query, eq:()=>query, order:()=>query, range:()=>query, limit:()=>query, maybeSingle:()=>query,
      update:()=>{result={data:null,error:null};return query;},
      insert:(row:{item_key:string})=>{result={data:null,error:claims.has(row.item_key)?{code:"23505"}:null};claims.add(row.item_key);return query;},
      delete:()=>query,
      then:(resolve:(value:unknown)=>unknown)=>Promise.resolve(result).then(resolve),
    };
    return query;
  }} as unknown as SupabaseClient<Database>;
  return {db,state};
}
beforeEach(()=>{send.mockReset();send.mockResolvedValue({ok:true,expired:false});});
describe("Scheduled loan funding pushes",()=>{
  it("delivers a ₹13 shortfall after an ordinary notification, once per device per day",async()=>{
    const {db}=fakeDatabase();
    expect((await dispatchPaymentReminders(db,"test-only","2026-11-04")).sent).toBe(1);
    expect(send.mock.calls[0]?.[2]).toMatchObject({tag:"ledgerline-loan-funding",url:"/plan"});
    expect((await dispatchPaymentReminders(db,"test-only","2026-11-04")).sent).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("sends no shortfall push after full ₹3,13,913 funding is recorded",async()=>{
    const {db,state}=fakeDatabase();state.amount=313913;
    expect((await dispatchPaymentReminders(db,"test-only","2026-11-04")).sent).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });
  it("respects the timed check-in notification switch",async()=>{
    const {db}=fakeDatabase();
    expect(await dispatchCheckInReminders(db,"test-only",new Date("2026-11-04T04:00:00Z"))).toEqual({checkInsSent:0});
    expect(send).not.toHaveBeenCalled();
  });
});