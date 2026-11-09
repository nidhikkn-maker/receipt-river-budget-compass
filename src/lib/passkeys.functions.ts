import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { relyingPartyFor } from "@/lib/passkey-origin";
import { passkeyOptionsCore, verifyPasskeyCore, type PasskeyDeps } from "@/lib/passkey-server";
import { createSharedStepUpLimiter, fallbackStepUpLimiter, recordStepUp } from "@/lib/step-up-server";
import { isMissingFunction } from "@/lib/step-up";
// The relying party comes from the allowlist in passkey-origin, never from the Origin header alone (review M-3).
function relyingParty(){return relyingPartyFor(getRequest().headers.get("origin"),process.env);}
// "stepup" is an authentication like "unlock", but its challenge is bound to its own kind so an unlock
// challenge can never be replayed as a re-confirmation, and only a verified step-up records a grant.
// "register" needs a fresh grant for register_passkey (passkey, password or emailed code) from this session.
const Kind=z.enum(["register","unlock","stepup"]);
type Ctx={supabase:import("@supabase/supabase-js").SupabaseClient<import("@/integrations/supabase/types").Database>;userId:string;claims:unknown};
type RpcCall=(fn:string,args?:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{message:string;code?:string}|null}>;
/** Wires the tested handler core (passkey-server.ts) to the caller's token and the service role. */
function deps(context:Ctx):PasskeyDeps{
 // The service role is loaded only when a step-up is counted or recorded, as before.
 const admin={rpc:async(fn:string,args?:Record<string,unknown>)=>{const {supabaseAdmin}=await import("@/integrations/supabase/client.server");return (supabaseAdmin.rpc as unknown as RpcCall).call(supabaseAdmin,fn,args);}};
 const sb=context.supabase,uid=context.userId;
 return {userId:uid,claims:context.claims,rp:relyingParty(),
  listCredentialIds:async()=>{const {data,error}=await sb.from("device_passkeys").select("credential_id");if(error)throw error;return (data??[]).map(k=>k.credential_id);},
  saveChallenge:async(c)=>{const {error}=await sb.from("passkey_challenges").upsert({owner_id:uid,...c});if(error)throw error;},
  takeChallenge:async()=>{const {data,error}=await sb.from("passkey_challenges").delete().eq("owner_id",uid).select().maybeSingle();if(error)throw error;return data;},
  findKey:async(id)=>{const {data}=await sb.from("device_passkeys").select("*").eq("credential_id",id).maybeSingle();return data;},
  insertKey:async(row)=>{const {error}=await sb.from("device_passkeys").insert(row);if(error)throw error;},
  updateCounter:async(id,counter)=>{const {error}=await sb.from("device_passkeys").update({counter}).eq("credential_id",id);if(error)throw error;},
  hasFreshGrantFor:async(action)=>{
   const call=sb.rpc as unknown as RpcCall;
   const {data,error}=await call.call(sb,"has_recent_step_up_for",{_action:action});
   if(error){if(isMissingFunction(error))return null;throw Error("Couldn't check your confirmation. Please try again.");}
   return data===true;
  },
  recordStepUp:(owner,method,session)=>recordStepUp(admin,owner,method,session),
  limiter:createSharedStepUpLimiter(admin,fallbackStepUpLimiter),
 };
}
export const passkeyOptions=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((d:unknown)=>z.object({kind:Kind}).parse(d)).handler(async({data,context})=>passkeyOptionsCore(deps(context),data.kind));
export const verifyPasskey=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((d:unknown)=>z.object({kind:Kind,response:z.record(z.string(),z.unknown())}).parse(d)).handler(async({data,context})=>verifyPasskeyCore(deps(context),data.kind,data.response));
