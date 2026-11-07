import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseFundQuote } from "./mutual-funds";

export const getFundNav = createServerFn({ method:"POST" })
 .middleware([requireSupabaseAuth])
 .inputValidator((input:unknown) => z.object({ schemeCode:z.string().regex(/^\d{5,8}$/) }).parse(input))
 .handler(async ({data}) => {
  try {
   const response = await fetch(`https://api.mfapi.in/mf/${data.schemeCode}/latest`,{signal:AbortSignal.timeout(12000),headers:{Accept:"application/json"}});
   if (!response.ok) throw Error("NAV source unavailable");
   const text = await response.text();
   if (text.length > 100_000) throw Error("NAV response too large");
   const quote = parseFundQuote(JSON.parse(text),data.schemeCode,new Date().toISOString().slice(0,10));
   return {ok:true as const,quote};
  } catch {
   return {ok:false as const,error:"Couldn't fetch this fund's NAV. Check the AMFI scheme code or try again later; saved valuations are unchanged."};
  }
 });