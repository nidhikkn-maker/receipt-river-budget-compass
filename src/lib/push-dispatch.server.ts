import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { normalizePreferences, type FinancePreferences } from "./preferences";
import { paymentReminderItems, reminderBatches } from "./push-rules";
import { normalizeNotificationSettings } from "./notification-settings";
import { sendDevicePush } from "./push-crypto.server";
import { accountBalance, type Account, type AccountKind, type Txn, type TxnType } from "./ledger";
import type { Commitment } from "./planning";
import type { PositionLoan } from "./position";
import type { LoanPayment } from "./cards";

export async function dispatchPaymentReminders(db: SupabaseClient<Database>, seed: string, today: string) {
  // Recheck already-notified devices: a funding shortfall can appear later the same day.
  const { data: devices, error } = await db.from("push_subscriptions").select("*");
  if (error) throw Error("Couldn't load notification devices");
  let sent=0, failed=0, skipped=0;
  await Promise.all((devices ?? []).map(async device => {
    const owner = device.owner_id;
    const [pref,c,l,a,t,d] = await Promise.all([
      db.from("finance_preferences").select("data").eq("owner_id",owner).maybeSingle(),
      db.from("commitments").select("*").eq("owner_id",owner),
      db.from("loans").select("*").eq("owner_id",owner),
      db.from("accounts").select("*").eq("owner_id",owner),
      (async()=>{const rows: Database["public"]["Tables"]["expenses"]["Row"][]=[];for(let offset=0;;offset+=500){const result=await db.from("expenses").select("*").eq("employee_id",owner).order("id").range(offset,offset+499);if(result.error)return {data:rows,error:result.error};rows.push(...(result.data ?? []));if((result.data?.length ?? 0)<500)return {data:rows,error:null};}})(),
      db.from("documents").select("id,expires_on").eq("owner_id",owner),
    ]);
    if ([pref,c,l,a,t,d].some(r=>r.error)) { failed++; return; }
    const p = normalizePreferences(pref.data?.data as Partial<FinancePreferences> | null);
    const commitments = (c.data ?? []).map(x=>({id:x.id,name:x.name,kind:x.kind,direction:x.direction,amount:Number(x.amount),frequency:x.frequency,intervalDays:x.interval_days,nextDue:x.next_due,accountId:x.account_id,category:x.category,confirmed:x.confirmed,essential:x.essential,status:x.status})) as Commitment[];
    const loans: PositionLoan[] = (l.data ?? []).map(x=>({id:x.id,name:x.name,principal:Number(x.principal_outstanding),rate:Number(x.annual_rate),emi:Number(x.emi),nextDue:x.next_due,accountId:x.account_id,loanType:x.loan_type,sourceTransactionId:x.source_transaction_id,original:Number(x.original_principal ?? x.principal_outstanding),startDate:x.start_date,payments:(x.payments ?? []) as unknown as LoanPayment[],status:x.status}));
    const accounts: Account[] = (a.data ?? []).map(x=>({id:x.id,name:x.name,kind:x.kind as AccountKind,openingBalance:Number(x.opening_balance),archived:x.archived,statementDay:x.statement_day,dueDay:x.due_day,creditLimit:x.credit_limit,details:x.details as NonNullable<Account["details"]>}));
    const transactions: Txn[] = (t.data ?? []).map(x=>({id:x.id,txnType:x.txn_type as TxnType,amount:Number(x.amount),accountId:x.account_id,toAccountId:x.to_account_id,date:x.expense_date,adjustmentSign:x.adjustment_sign === -1 ? -1 : 1,transferCounterpartOf:x.transfer_counterpart_of,principal:x.principal,interest:x.interest,...(x.original_amount == null ? {} : { originalAmount:x.original_amount })}));
    for(const loan of loans){const account=accounts.find(a=>a.id===loan.accountId);if(account&&loan.loanType!=="credit_card_emi")loan.principal=accountBalance(account,transactions);}
    const items=paymentReminderItems({today,leadDays:p.reminderDays,enabled:p.reminders,notifications:p.notifications,commitments,loans,accounts,transactions,documents:(d.data ?? []).map(x=>({id:x.id,expiresOn:x.expires_on})),trips:(p.trips ?? []) as never});
    if (!items.length) { skipped++; return; }
    for (const { key, payload } of reminderBatches(items, device.id)) {
    const { error: claimError } = await db.from("push_reminder_log").insert({owner_id:owner,sent_on:today,item_key:key});
    if (claimError) { if(claimError.code === "23505") skipped++; else failed++; continue; }
    try {
      const result=await sendDevicePush(seed,device,payload);
      if (result.expired) { await db.from("push_subscriptions").delete().eq("id",device.id); skipped++; return; }
      if (!result.ok) throw Error("Delivery refused");
      await db.from("push_subscriptions").update({last_sent_at:new Date().toISOString()}).eq("id",device.id);
      sent++;
    } catch {
      await db.from("push_reminder_log").delete().eq("owner_id",owner).eq("sent_on",today).eq("item_key",key);
      failed++;
    }
    }
  }));
  return {sent,failed,skipped};
}
/** Sends one lock-screen nudge per device when a saved booking check-in time arrives; each check-in is claimed once per owner. */
export async function dispatchCheckInReminders(db: SupabaseClient<Database>, seed: string, now: Date, windowMin = 15) {
  const { dueCheckIns, checkInPayload } = await import("./push-rules");
  const { data: devices, error } = await db.from("push_subscriptions").select("*").limit(200);
  if (error) throw Error("Couldn't load notification devices");
  const owners = [...new Set((devices ?? []).map((d) => d.owner_id))];
  let sent = 0;
  for (const owner of owners) {
    const pref = await db.from("finance_preferences").select("data").eq("owner_id", owner).maybeSingle();
    if (pref.error) continue;
    const p = normalizePreferences(pref.data?.data as Partial<FinancePreferences> | null);
    if (!p.reminders || !normalizeNotificationSettings(p.notifications).checkIns) continue;
    const due = dueCheckIns((p.trips ?? []) as never, now.getTime(), windowMin);
    const claimed: string[] = [];
    for (const d of due) {
      const { error: e } = await db.from("push_reminder_log").insert({ owner_id: owner, sent_on: d.at.slice(0, 10), item_key: d.key });
      if (!e) claimed.push(d.key);
    }
    if (!claimed.length) continue;
    for (const device of (devices ?? []).filter((x) => x.owner_id === owner)) {
      try { const r = await sendDevicePush(seed, device, checkInPayload(claimed.length)); if (r.expired) await db.from("push_subscriptions").delete().eq("id", device.id); else if (r.ok) sent++; } catch { /* other devices still try */ }
    }
  }
  return { checkInsSent: sent };
}
/** Lock-screen nudge when monthly depreciation is prepared and waiting for approval; claimed once per owner per month, no figures in the message. */
export async function dispatchDepreciationReminders(db: SupabaseClient<Database>, seed: string, owners: string[], month: string, today: string) {
  let sent = 0, skipped = 0;
  for (const owner of [...new Set(owners)]) {
    const pref = await db.from("finance_preferences").select("data").eq("owner_id", owner).maybeSingle();
    if (pref.error) { skipped++; continue; }
    const p = normalizePreferences(pref.data?.data as Partial<FinancePreferences> | null);
    if (!p.reminders || !normalizeNotificationSettings(p.notifications).depreciation) { skipped++; continue; }
    const key = `depreciation:${month}`;
    const { data: devices } = await db.from("push_subscriptions").select("*").eq("owner_id", owner);
    if (!devices?.length) { skipped++; continue; }
    const { error: claim } = await db.from("push_reminder_log").insert({ owner_id: owner, sent_on: today, item_key: key });
    if (claim) { skipped++; continue; }
    const payload = { title: "Depreciation ready", body: "Last month's depreciation is ready for your approval.", url: "/inbox", tag: key };
    for (const device of devices) {
      try { const r = await sendDevicePush(seed, device, payload as never); if (r.expired) await db.from("push_subscriptions").delete().eq("id", device.id); else if (r.ok) sent++; } catch { /* other devices still try */ }
    }
  }
  return { sent, skipped };
}
