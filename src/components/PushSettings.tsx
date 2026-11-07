import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bell, BellOff, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { getPushConfig, removePushDevice, savePushDevice, testDevicePush } from "@/lib/push.functions";
import { offlineAppAllowed, registerOfflineApp } from "@/lib/pwa";
import { useStore } from "@/lib/store";
import { Switch } from "./ui/switch";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { NOTIFICATION_TYPES, normalizeNotificationSettings } from "@/lib/notification-settings";

function keyBytes(key: string) { return Uint8Array.from(atob(key.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0)); }
type TestState = "sending" | "accepted" | "shown" | "unconfirmed" | "failed";
function Step({done,failed,label}:{done:boolean;failed:boolean;label:string}) {
  return <li className={`flex items-center gap-2 ${failed?"text-destructive":done?"text-foreground":"text-muted-foreground"}`}><span aria-hidden className="w-4 text-center">{failed?"✕":done?"✓":"…"}</span>{label}</li>;
}
export function PushSettings() {
  const { preferences, userId, savePreferences, loading }=useStore();
  const choices = normalizeNotificationSettings(preferences.notifications);
  const [saving, setSaving] = useState(false);
  const [days, setDays] = useState(String(preferences.reminderDays));
  useEffect(() => setDays(String(preferences.reminderDays)), [preferences.reminderDays]);
  const update = async (patch: Partial<typeof preferences>) => {
    setSaving(true);
    try { await savePreferences({ ...preferences, ...patch }); toast.success("Notification settings saved"); }
    catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };
  const config=useServerFn(getPushConfig), save=useServerFn(savePushDevice), remove=useServerFn(removePushDevice), test=useServerFn(testDevicePush);
  const [status,setStatus]=useState("Checking this device…");
  const [sub,setSub]=useState<PushSubscription|null>(null);
  const [supported,setSupported]=useState(false),[busy,setBusy]=useState(false);
  useEffect(()=>{
    let active=true;
    const load=async()=>{
      const setup=await config();
      if(!setup.available){if(active)setStatus("Notifications are not configured yet.");return;}
      if (!offlineAppAllowed()) {if(active)setStatus("Device notifications become available in the published app.");return;}
      if (!("Notification" in window) || !("PushManager" in window) || !("serviceWorker" in navigator)) {if(active)setStatus("Notifications aren't supported here. On iPhone, use the installed Home Screen app.");return;}
      if(active)setSupported(true);
      const reg=await navigator.serviceWorker.getRegistration("/");
      const existing=await reg?.pushManager.getSubscription();
      if(active){setSub(existing ?? null);setStatus(existing?"Notifications are enabled on this device.":Notification.permission === "denied" ? "Notifications are blocked in this device’s settings." : "Notifications are off on this device.");}
    };
    void load().catch(()=>{if(active)setStatus("Couldn't check this device. Try again.");});
    return()=>{active=false;};
  },[userId,config]);
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
  const [delivery,setDelivery]=useState<{state:TestState;at:number;detail?:string}|null>(null);
  useEffect(()=>{
    if(!("serviceWorker" in navigator))return;
    const onMsg=(e:MessageEvent)=>{if(e.data?.type==="ledgerline-test-shown")setDelivery(d=>d&&d.state!=="failed"?{state:"shown",at:Date.now()}:d);};
    navigator.serviceWorker.addEventListener("message",onMsg);
    return()=>navigator.serviceWorker.removeEventListener("message",onMsg);
  },[]);
  // If the phone never reports showing it, say so instead of leaving "waiting" forever.
  useEffect(()=>{if(delivery?.state!=="accepted")return;const t=setTimeout(()=>setDelivery(d=>d?.state==="accepted"?{...d,state:"unconfirmed"}:d),30000);return()=>clearTimeout(t);},[delivery]);
  const sendTest=async()=>{if(!sub)return;setBusy(true);setDelivery({state:"sending",at:Date.now()});try{const result=await test({data:{endpoint:sub.endpoint}});if(result.expired){await sub.unsubscribe();setSub(null);throw Error("This registration expired. Enable notifications again.");}if(!result.ok)throw Error("The notification service couldn't accept the test. Try again later.");setDelivery(d=>d?.state==="shown"?d:{state:"accepted",at:Date.now()});}catch(e){const msg=(e as Error).message;setDelivery({state:"failed",at:Date.now(),detail:msg});toast.error(msg);}finally{setBusy(false);}};
  return <section className="mb-8 py-3" aria-labelledby="push-settings-title">
    <h2 id="push-settings-title" className="mb-2 flex items-center gap-2 font-display text-xl font-bold"><Bell className="h-5 w-5"/>Device notifications</h2>
    <p role="status" className="mb-3 text-sm text-muted-foreground">{status}</p>
    <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy||!supported} onClick={sub?disable:enable}>{sub?<BellOff className="h-4 w-4"/>:<Bell className="h-4 w-4"/>}{sub?"Turn off this device":"Enable this device"}</Button><Button variant="outline" disabled={busy||!sub||!supported} onClick={sendTest}><Send className="h-4 w-4"/>Send test notification</Button></div>
    {delivery&&<div role="status" aria-live="polite" className="mt-3 rounded-lg border bg-card p-3 text-sm text-card-foreground">
      <p className="font-medium">Test delivery · {new Date(delivery.at).toLocaleTimeString()}</p>
      <ol className="mt-2 space-y-1">
        <Step done={delivery.state!=="sending"&&delivery.state!=="failed"} failed={delivery.state==="failed"} label="Sent to the notification service"/>
        <Step done={delivery.state==="shown"} failed={delivery.state==="unconfirmed"} label={delivery.state==="unconfirmed"?"Not confirmed on this device within 30 seconds":"Shown on this device"}/>
      </ol>
      {delivery.state==="failed"&&<p className="mt-2 text-destructive">{delivery.detail}</p>}
      {delivery.state==="unconfirmed"&&<p className="mt-2 text-muted-foreground">If you saw the notification, it's working. If not, check Settings → Notifications → Ledgerline on your phone, and that Focus mode is off.</p>}
    </div>}
    <fieldset disabled={loading || saving} className="mt-6 min-w-0 divide-y">
      <div className="flex items-center justify-between gap-4 py-4"><Label htmlFor="all-reminders">All reminders</Label><Switch id="all-reminders" checked={preferences.reminders} disabled={saving} onCheckedChange={value=>void update({reminders:value})}/></div>
      {NOTIFICATION_TYPES.map(({key,label})=><div key={key} className="flex items-center justify-between gap-4 py-4"><Label className="min-w-0 break-words leading-5" htmlFor={`notify-${key}`}>{label}</Label><Switch id={`notify-${key}`} className="shrink-0" checked={choices[key]} disabled={saving||!preferences.reminders} onCheckedChange={value=>void update({notifications:{...choices,[key]:value}})}/></div>)}
    </fieldset>
    <div className="mt-4 flex flex-wrap items-end gap-3"><div className="grid gap-2"><Label htmlFor="notification-lead-days">Days before due date</Label><Input id="notification-lead-days" className="w-24" disabled={loading||saving} type="number" min={0} max={30} value={days} onChange={e=>setDays(e.target.value)}/></div><Button variant="outline" disabled={loading||saving||!Number.isFinite(Number(days))||days.trim()===""} onClick={()=>update({reminderDays:Math.min(30,Math.max(0,Math.round(Number(days))))})}>Save timing</Button></div>
    <p className="mt-4 text-xs text-muted-foreground">Loan funding is checked from its scheduled transfer date until the EMI is paid or due. Lock-screen messages never include account names, balances or amounts.</p>
  </section>;
}