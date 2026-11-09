// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";

it("production worker hides injected financial details and opens only the same-origin Plan",async()=>{
  const handlers:Record<string,(event:unknown)=>void>={};const show=vi.fn(async()=>{}),open=vi.fn(async()=>{});
  runInNewContext(readFileSync(new URL("../../public/push-events.js",import.meta.url),"utf8"),{URL,self:{location:{origin:"https://app.example"},addEventListener:(name:string,fn:(e:unknown)=>void)=>handlers[name]=fn,registration:{showNotification:show},clients:{matchAll:async()=>[],openWindow:open}}});
  let job=Promise.resolve();
  handlers["push"]?.({data:{json:()=>({title:"Secret balance",body:"Rent ₹50,000",url:"https://evil.example"})},waitUntil:(p:Promise<void>)=>job=p});await job;
  expect(show).toHaveBeenCalledWith("Thapal",expect.objectContaining({body:"Open Thapal to review your reminders.",data:{url:"/plan"}}));
  handlers["notificationclick"]?.({notification:{close:vi.fn(),data:{url:"https://evil.example"}},waitUntil:(p:Promise<void>)=>job=p});await job;
  expect(open).toHaveBeenCalledWith("https://app.example/plan");
});