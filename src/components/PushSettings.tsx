import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bell, BellOff, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { getPushConfig, removePushDevice, savePushDevice, testDevicePush } from "@/lib/push.functions";
import { offlineAppAllowed, registerOfflineApp } from "@/lib/pwa";
import { useStore } from "@/lib/store";

function keyBytes(key: string) { return Uint8Array.from(atob(key.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0)); }
export function PushSettings() {
  const { preferences, userId }=useStore();
  const config=useServerFn(getPushConfig), save=useServerFn(savePushDevice), remove=useServerFn(removePushDevice), test=useServerFn(testDevicePush);
  const [status,setStatus]=useState("Checking this device…");
  const [sub,setSub]=useState<PushSubscription|null>(null);
  const [supported,setSupported]=useState(false),[busy,setBusy]=useState(false);
  useEffect(()=>{
    let active=true;
    const load=async()=>{
      if (!offlineAppAllowed()) {if(active)setStatus("Device notifications become available in the published app.");return;}
      if (!("Notification" in window) || !("PushManager" in window) || !("serviceWorker" in navigator)) {if(active)setStatus("Notifications aren't supported here. On iPhone, use the installed Home Screen app.");return;}
      if(active)setSupported(true);
      const reg=await navigator.serviceWorker.getRegistration("/");
      const existing=await reg?.pushManager.getSubscription();
      if(active){setSub(existing ?? null);setStatus(existing?"Notifications are enabled on this device.":Notification.permission === "denied" ? "Notifications are blocked in this device’s settings." : "Notifications are off on this device.");}
    };
    void load().catch(()=>{if(active)setStatus("Couldn't check this device. Try again.");});
    return()=>{active=false;};
  },[userId]);
  const enable=async()=>{
    setBusy(true);
    try {
      // Permission request stays directly attached to the user's click, as required on iOS.
      const permission=await Notification.requestPermission();
      if(permission!=="granted")throw Error("Allow notifications in this device’s settings to continue.");
      const result=await config();if(!result.available)throw Error("Notifications are not configured yet.");
      await registerOfflineApp();
      const reg=await navigator.serviceWorker.getRegistration("/");if(!reg)throw Error("The installed app isn't ready. Reopen it and try again.");
      let current=await reg.pushManager.getSubscription();
      if(!current)current=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(result.publicKey)});
      const json=current.toJSON();if(!json.endpoint||!json.keys?.["p256dh"]||!json.keys["auth"])throw Error("Couldn't read the notification registration.");
      try {await save({data:{endpoint:json.endpoint,keys:{p256dh:json.keys["p256dh"],auth:json.keys["auth"]},userAgent:navigator.userAgent.slice(0,300)}});}
      catch(e){await current.unsubscribe();throw e;}
      setSub(current);setStatus("Notifications are enabled on this device.");toast.success("Device notifications enabled");
    } catch(e){toast.error((e as Error).message);}finally{setBusy(false);}
  };
  const disable=async()=>{if(!sub)return;setBusy(true);try{await remove({data:{endpoint:sub.endpoint}});await sub.unsubscribe();setSub(null);setStatus("Notifications are off on this device.");}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}};
  const sendTest=async()=>{if(!sub)return;setBusy(true);try{const result=await test({data:{endpoint:sub.endpoint}});if(result.expired){await sub.unsubscribe();setSub(null);throw Error("This registration expired. Enable notifications again.");}if(!result.ok)throw Error("The notification service couldn't accept the test. Try again later.");toast.success("Test accepted by the notification service");}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}};
  return <section className="mb-8 border-y py-5" aria-labelledby="push-settings-title"><h2 id="push-settings-title" className="mb-2 flex items-center gap-2 font-display text-xl font-bold"><Bell className="h-5 w-5"/>Device notifications</h2><p role="status" className="mb-3 text-sm text-muted-foreground">{status}</p>{!preferences.reminders&&<p className="mb-3 text-sm text-warning">Payment reminders are switched off for your account.</p>}<div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy||!supported||(!sub&&!preferences.reminders)} onClick={()=>void(sub?disable():enable())}>{sub?<BellOff className="h-4 w-4"/>:<Bell className="h-4 w-4"/>}{sub?"Turn off this device":"Enable this device"}</Button><Button variant="outline" disabled={busy||!sub||!supported} onClick={()=>void sendTest()}><Send className="h-4 w-4"/>Send test</Button></div><p className="mt-3 text-xs text-muted-foreground">Lock-screen messages never include payment names, balances or amounts.</p></section>;
}