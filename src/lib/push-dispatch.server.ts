import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { normalizePreferences, type FinancePreferences } from "./preferences";
import { paymentReminderItems, privateReminderPayload } from "./push-rules";
import { sendDevicePush } from "./push-crypto.server";
import type { Account, AccountKind, Txn, TxnType } from "./ledger";
import type { Commitment } from "./planning";
import type { PositionLoan } from "./position";

export async function dispatchPaymentReminders(db: SupabaseClient<Database>, seed: string, today: string) {
  // Rotate through devices; the scheduler can safely retry without duplicate daily deliveries.
  const { data: devices, error } = await db.from("push_subscriptions").select("*").or(`last_sent_at.is.null,last_sent_at.lt.${today}T00:00:00Z`).order("last_sent_at",{nullsFirst:true}).limit(10);
  if (error) throw Error("Couldn't load notification devices");
  let sent=0, failed=0, skipped=0;
  await Promise.all((devices ?? []).map(async device => {
    const owner = device.owner_id;
    const [pref,c,l,a,t,d] = await Promise.all([
      db.from("finance_preferences").select("data").eq("owner_id",owner).maybeSingle(),
      db.from("commitments").select("*").eq("owner_id",owner),
      db.from("loans").select("*").eq("owner_id",owner),
      db.from("accounts").select("*").eq("owner_id",owner),
      db.from("expenses").select("id,txn_type,amount_inr,account_id,to_account_id,expense_date,adjustment_sign").eq("owner_id",owner),
      db.from("documents").select("id,expires_on").eq("owner_id",owner),
    ]);
    if ([pref,c,l,a,t,d].some(r=>r.error)) { failed++; return; }
    const p = normalizePreferences(pref.data?.data as Partial<FinancePreferences> | null);
    const commitments = (c.data ?? []).map(x=>({id:x.id,name:x.name,kind:x.kind,direction:x.direction,amount:Number(x.amount),frequency:x.frequency,intervalDays:x.interval_days,nextDue:x.next_due,accountId:x.account_id,category:x.category,confirmed:x.confirmed,essential:x.essential,status:x.status})) as Commitment[];
    const loans: PositionLoan[] = (l.data ?? []).map(x=>({id:x.id,name:x.name,principal:Number(x.principal_outstanding),rate:Number(x.annual_rate),emi:Number(x.emi),nextDue:x.next_due,accountId:x.account_id,loanType:x.loan_type,sourceTransactionId:x.source_transaction_id,original:Number(x.original_principal ?? x.principal_outstanding),startDate:x.start_date,payments:x.payments as unknown as PositionLoan["payments"],status:x.status}));
    const accounts: Account[] = (a.data ?? []).map(x=>({id:x.id,name:x.name,kind:x.kind as AccountKind,openingBalance:Number(x.opening_balance),archived:x.archived,statementDay:x.statement_day,dueDay:x.due_day,creditLimit:x.credit_limit}));
    const transactions: Txn[] = (t.data ?? []).map(x=>({id:x.id,txnType:x.txn_type as TxnType,amount:Number(x.amount_inr),accountId:x.account_id,toAccountId:x.to_account_id,date:x.expense_date,adjustmentSign:x.adjustment_sign === -1 ? -1 : 1}));
    const items=paymentReminderItems({today,leadDays:p.reminderDays,enabled:p.reminders,commitments,loans,accounts,transactions,documents:(d.data ?? []).map(x=>({id:x.id,expiresOn:x.expires_on}))});
    if (!items.length) { await db.from("push_subscriptions").update({last_sent_at:new Date().toISOString()}).eq("id",device.id); skipped++; return; }
    const key=`device:${device.id}`;
    const { error: claimError } = await db.from("push_reminder_log").insert({owner_id:owner,sent_on:today,item_key:key});
    if (claimError) { skipped++; return; }
    try {
      const result=await sendDevicePush(seed,device,privateReminderPayload(items.length));
      if (result.expired) { await db.from("push_subscriptions").delete().eq("id",device.id); skipped++; return; }
      if (!result.ok) throw Error("Delivery refused");
      await db.from("push_subscriptions").update({last_sent_at:new Date().toISOString()}).eq("id",device.id);
      sent++;
    } catch {
      await db.from("push_reminder_log").delete().eq("owner_id",owner).eq("sent_on",today).eq("item_key",key);
      failed++;
    }
  }));
  return {sent,failed,skipped};
}