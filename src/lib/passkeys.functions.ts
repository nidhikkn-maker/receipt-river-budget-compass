import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from "@simplewebauthn/server";
function originFromRequest(){const req=getRequest();const origin=req.headers.get("origin");if(!origin)throw Error("Open this app in your browser to use Face ID");const url=new URL(origin);if(url.protocol!=="https:"&&url.hostname!=="localhost")throw Error("Passkeys require HTTPS");return url;}
export const passkeyOptions=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((d:unknown)=>z.object({kind:z.enum(["register","unlock"])}).parse(d)).handler(async({data,context})=>{
 const origin=originFromRequest();const {generateRegistrationOptions,generateAuthenticationOptions}=await import("@simplewebauthn/server");
 const {data:keys,error}=await context.supabase.from("device_passkeys").select("credential_id");if(error)throw Error("Couldn't load passkeys");
 const credentials=(keys??[]).map(k=>({id:k.credential_id}));
 const options=data.kind==="register"?await generateRegistrationOptions({rpName:"Thapal",rpID:origin.hostname,userName:context.userId,userID:new TextEncoder().encode(context.userId),attestationType:"none",excludeCredentials:credentials,authenticatorSelection:{authenticatorAttachment:"platform",residentKey:"preferred",userVerification:"required"}}):await generateAuthenticationOptions({rpID:origin.hostname,allowCredentials:credentials,userVerification:"required"});
 const {error:saveError}=await context.supabase.from("passkey_challenges").upsert({owner_id:context.userId,challenge:options.challenge,origin:origin.origin,kind:data.kind,expires_at:new Date(Date.now()+300000).toISOString()});if(saveError)throw Error("Couldn't start Face ID verification");return {kind:data.kind,options:JSON.stringify(options)};
});
export const verifyPasskey=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((d:unknown)=>z.object({kind:z.enum(["register","unlock"]),response:z.record(z.string(),z.unknown())}).parse(d)).handler(async({data,context})=>{
 const origin=originFromRequest();
 const {data:challenge,error}=await context.supabase.from("passkey_challenges").delete().eq("owner_id",context.userId).select().maybeSingle();
 if(error||!challenge||challenge.kind!==data.kind||challenge.origin!==origin.origin||Date.parse(challenge.expires_at)<Date.now())throw Error("Face ID request expired; try again");
 const {verifyRegistrationResponse,verifyAuthenticationResponse}=await import("@simplewebauthn/server");
 if(data.kind==="register"){
  const result=await verifyRegistrationResponse({response:data.response as unknown as RegistrationResponseJSON,expectedChallenge:challenge.challenge,expectedOrigin:origin.origin,expectedRPID:origin.hostname,requireUserVerification:true});
  if(!result.verified)throw Error("Face ID verification failed");const c=result.registrationInfo.credential;
  const bytes=Array.from(c.publicKey).map(b=>String.fromCharCode(b)).join("");
  const {error:e}=await context.supabase.from("device_passkeys").insert({owner_id:context.userId,credential_id:c.id,public_key:btoa(bytes),counter:c.counter,transports:c.transports??[]});if(e)throw Error("Couldn't save passkey");
 }else{
  const id=typeof data.response["id"]==="string"?data.response["id"]:"";
  const {data:key}=await context.supabase.from("device_passkeys").select("*").eq("credential_id",id).maybeSingle();if(!key)throw Error("Passkey not found");
  const result=await verifyAuthenticationResponse({response:data.response as unknown as AuthenticationResponseJSON,expectedChallenge:challenge.challenge,expectedOrigin:origin.origin,expectedRPID:origin.hostname,requireUserVerification:true,credential:{id:key.credential_id,publicKey:Uint8Array.from(atob(key.public_key),c=>c.charCodeAt(0)),counter:Number(key.counter)}});
  if(!result.verified)throw Error("Face ID verification failed");const {error:e}=await context.supabase.from("device_passkeys").update({counter:result.authenticationInfo.newCounter}).eq("credential_id",id);if(e)throw Error("Couldn't finish verification");
 }
 return {ok:true};
});
