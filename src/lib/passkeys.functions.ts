import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { relyingPartyFor } from "@/lib/passkey-origin";
import { challengeUsable, isAssistantClaims, recordStepUp } from "@/lib/step-up-server";
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from "@simplewebauthn/server";
// The relying party comes from the allowlist in passkey-origin, never from the Origin header alone (review M-3).
function relyingParty(){return relyingPartyFor(getRequest().headers.get("origin"),process.env);}
// "stepup" is an authentication like "unlock", but its challenge is bound to its own kind so an unlock
// challenge can never be replayed as a re-confirmation, and only a verified step-up records a grant.
const Kind=z.enum(["register","unlock","stepup"]);
export const passkeyOptions=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((d:unknown)=>z.object({kind:Kind}).parse(d)).handler(async({data,context})=>{
 if(data.kind==="stepup"&&isAssistantClaims(context.claims))throw Error("Connected assistants can't confirm changes");
 const rp=relyingParty();const {generateRegistrationOptions,generateAuthenticationOptions}=await import("@simplewebauthn/server");
 const {data:keys,error}=await context.supabase.from("device_passkeys").select("credential_id");if(error)throw Error("Couldn't load passkeys");
 const credentials=(keys??[]).map(k=>({id:k.credential_id}));
 if(data.kind==="stepup"&&!credentials.length)throw Error("No Face ID / passkey is set up for this account. Use your password.");
 const options=data.kind==="register"?await generateRegistrationOptions({rpName:"Thapal",rpID:rp.rpID,userName:context.userId,userID:new TextEncoder().encode(context.userId),attestationType:"none",excludeCredentials:credentials,authenticatorSelection:{authenticatorAttachment:"platform",residentKey:"preferred",userVerification:"required"}}):await generateAuthenticationOptions({rpID:rp.rpID,allowCredentials:credentials,userVerification:"required"});
 const {error:saveError}=await context.supabase.from("passkey_challenges").upsert({owner_id:context.userId,challenge:options.challenge,origin:rp.origin,kind:data.kind,expires_at:new Date(Date.now()+300000).toISOString()});if(saveError)throw Error("Couldn't start Face ID verification");return {kind:data.kind,options:JSON.stringify(options)};
});
export const verifyPasskey=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((d:unknown)=>z.object({kind:Kind,response:z.record(z.string(),z.unknown())}).parse(d)).handler(async({data,context})=>{
 if(data.kind==="stepup"&&isAssistantClaims(context.claims))throw Error("Connected assistants can't confirm changes");
 const rp=relyingParty();
 const {data:challenge,error}=await context.supabase.from("passkey_challenges").delete().eq("owner_id",context.userId).select().maybeSingle();
 if(error||!challengeUsable(challenge,data.kind,rp.origin))throw Error("Face ID request expired; try again");
 const {verifyRegistrationResponse,verifyAuthenticationResponse}=await import("@simplewebauthn/server");
 if(data.kind==="register"){
  const result=await verifyRegistrationResponse({response:data.response as unknown as RegistrationResponseJSON,expectedChallenge:challenge.challenge,expectedOrigin:rp.origin,expectedRPID:rp.rpID,requireUserVerification:true});
  if(!result.verified)throw Error("Face ID verification failed");const c=result.registrationInfo.credential;
  const bytes=Array.from(c.publicKey).map(b=>String.fromCharCode(b)).join("");
  const {error:e}=await context.supabase.from("device_passkeys").insert({owner_id:context.userId,credential_id:c.id,public_key:btoa(bytes),counter:c.counter,transports:c.transports??[]});if(e)throw Error("Couldn't save passkey");
  return {ok:true,recorded:false};
 }
 const id=typeof data.response["id"]==="string"?data.response["id"]:"";
 const {data:key}=await context.supabase.from("device_passkeys").select("*").eq("credential_id",id).maybeSingle();if(!key)throw Error("Passkey not found");
 const result=await verifyAuthenticationResponse({response:data.response as unknown as AuthenticationResponseJSON,expectedChallenge:challenge.challenge,expectedOrigin:rp.origin,expectedRPID:rp.rpID,requireUserVerification:true,credential:{id:key.credential_id,publicKey:Uint8Array.from(atob(key.public_key),c=>c.charCodeAt(0)),counter:Number(key.counter)}});
 if(!result.verified)throw Error("Face ID verification failed");const {error:e}=await context.supabase.from("device_passkeys").update({counter:result.authenticationInfo.newCounter}).eq("credential_id",id);if(e)throw Error("Couldn't finish verification");
 if(data.kind!=="stepup")return {ok:true,recorded:false};
 const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
 return {ok:true,...await recordStepUp(supabaseAdmin,context.userId,"passkey")};
});
