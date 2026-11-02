import { requireRealAccount } from "@/lib/real-account-middleware";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { privateReminderPayload, pushSubscriptionSchema, validPushEndpoint } from "./push-rules";

export const getPushConfig = createServerFn({ method: "GET" }).middleware([requireRealAccount]).handler(async () => {
  const seed = process.env["WEB_PUSH_SIGNING_SEED"];
  if (!seed) return { available: false, publicKey: "" };
  const { signingKeys } = await import("./push-crypto.server");
  return { available: true, publicKey: (await signingKeys(seed)).publicKey };
});

export const savePushDevice = createServerFn({ method: "POST" }).middleware([requireRealAccount])
  .inputValidator((input: unknown) => pushSubscriptionSchema.parse(input)).handler(async ({ data, context }) => {
    const { count, error: countError } = await context.supabase.from("push_subscriptions").select("id", { count: "exact", head: true });
    if (countError) throw Error("Couldn't check notification devices");
    const { data: existing } = await context.supabase.from("push_subscriptions").select("id").eq("endpoint",data.endpoint).maybeSingle();
    if (!existing && (count ?? 0) >= 10) throw Error("Up to 10 notification devices are supported");
    const { error } = await context.supabase.from("push_subscriptions").upsert({ owner_id: context.userId, endpoint: data.endpoint, p256dh: data.keys.p256dh, auth: data.keys.auth, user_agent: data.userAgent }, { onConflict: "owner_id,endpoint" });
    if (error) throw Error("Couldn't save this notification device");
    return { ok: true };
  });

const endpointInput = z.object({ endpoint: z.string().max(2048).refine(validPushEndpoint) });
export const removePushDevice = createServerFn({ method: "POST" }).middleware([requireRealAccount])
  .inputValidator((input: unknown) => endpointInput.parse(input)).handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("push_subscriptions").delete().eq("endpoint",data.endpoint);
    if (error) throw Error("Couldn't turn off this notification device");
    return { ok: true };
  });

export const testDevicePush = createServerFn({ method: "POST" }).middleware([requireRealAccount])
  .inputValidator((input: unknown) => endpointInput.parse(input)).handler(async ({ data, context }) => {
    const seed = process.env["WEB_PUSH_SIGNING_SEED"];
    if (!seed) throw Error("Notifications are not configured yet");
    const { data: device, error } = await context.supabase.from("push_subscriptions").select("*").eq("endpoint",data.endpoint).maybeSingle();
    if (error || !device) throw Error("Enable this device first");
    // Conditional update claims a one-minute cooldown before making the provider call.
    const cutoff = new Date(Date.now()-60000).toISOString();
    const { data: claimed, error: claimError } = await context.supabase.from("push_subscriptions").update({last_sent_at:new Date().toISOString()}).eq("id",device.id).or(`last_sent_at.is.null,last_sent_at.lt.${cutoff}`).select("id");
    if (claimError || !claimed?.length) throw Error("Wait a minute before sending another test");
    const { sendDevicePush } = await import("./push-crypto.server");
    try {
      const result = await sendDevicePush(seed,device,privateReminderPayload(0,true));
      if (result.expired) await context.supabase.from("push_subscriptions").delete().eq("id",device.id);
      return { ok: result.ok, expired: result.expired };
    } catch { return { ok: false, expired: false }; }
  });