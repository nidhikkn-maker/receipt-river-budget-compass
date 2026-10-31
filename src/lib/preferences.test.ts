import { describe, expect, it } from "vitest";
import { budgetSpend, scopedBudgetUsage, type ScopedBudget } from "./preferences";
import type { Expense } from "./expenses";
const expense = (patch: Partial<Expense>): Expense => ({ id:"e", title:"Test", merchant:null, category:"Dining", scope:"personal", memberId:null, splits:[], amount:1000, originalAmount:1000, currency:"INR", fxRate:1, paymentMethod:"cash", date:"2026-10-10", description:"", receipts:[], ...patch });
const budget: ScopedBudget={id:"b",name:"Family",kind:"overall",value:"",amount:2000,period:"monthly",start:"2026-09-01",carry:true};
describe("Scoped budgets",()=>{
  it("attributes only a person's allocated share",()=>expect(budgetSpend(expense({splits:[{memberId:null,amount:300},{memberId:"family",amount:700}]}),{...budget,kind:"person",value:"family"})).toBe(700));
  it("carries unused monthly money into the next month",()=>expect(scopedBudgetUsage(budget,[expense({date:"2026-09-15",amount:500}),expense({})],"2026-10-31")).toMatchObject({carry:1500,allowance:3500,spent:1000,remaining:2500}));
  it("does not carry overspending",()=>expect(scopedBudgetUsage(budget,[expense({date:"2026-09-15",amount:3000})],"2026-10-31").carry).toBe(0));
  it("never counts transfers as spending",()=>expect(budgetSpend(expense({txnType:"transfer"}),budget)).toBe(0));
  it("uses annual rather than monthly allowance",()=>expect(scopedBudgetUsage({...budget,period:"annual",start:"2026-01-01",carry:false},[expense({date:"2026-02-01"}),expense({})],"2026-10-31").spent).toBe(2000));
  it("matches project tags exactly",()=>expect(budgetSpend(expense({tags:["Project: Home"]}),{...budget,kind:"project",value:"Project: Home"})).toBe(1000));
});