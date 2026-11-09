// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { p256 } from "@noble/curves/nist.js";
import { sendDevicePush, signingKeys } from "./push-crypto.server";
import { privateReminderPayload } from "./push-rules";

afterEach(()=>vi.unstubAllGlobals());
describe("Web-standard push encryption",()=>{
  it("derives a stable P-256 identity and never returns the signing seed",async()=>{
    vi.stubGlobal("crypto",webcrypto);
    const seed="test-only-seed-not-a-production-credential";
    const a=await signingKeys(seed),b=await signingKeys(seed);
    expect(a).toEqual(b);expect(a.publicKey).toHaveLength(87);expect(a.privateKey).toHaveLength(43);expect(a.privateKey).not.toBe(seed);
    expect((await signingKeys(seed+"2")).publicKey).not.toBe(a.publicKey);
  });
  it("encrypts payloads before fetch and disables redirects",async()=>{
    vi.stubGlobal("crypto",webcrypto);
    const pub=p256.getPublicKey(Uint8Array.from({length:32},()=>1),false);
    const encode=(b:Uint8Array)=>btoa(String.fromCharCode(...b)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
    const fetchMock=vi.fn(async(_url: string, _init?: RequestInit)=>new Response(null,{status:201}));vi.stubGlobal("fetch",fetchMock);
    expect(await sendDevicePush("test-only-seed-not-a-production-credential",{endpoint:"https://fcm.googleapis.com/a",p256dh:encode(pub),auth:encode(new Uint8Array(16).fill(3))},privateReminderPayload(1))).toEqual({ok:true,expired:false});
    const init=fetchMock.mock.calls[0]?.[1] as RequestInit|undefined;
    expect(init?.redirect).toBe("error");expect((init?.headers as Record<string,string>)["content-encoding"]).toBe("aes128gcm");
    expect(new TextDecoder().decode(init?.body as Uint8Array)).not.toContain("Thapal");
  });
});