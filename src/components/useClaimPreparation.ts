import { useEffect,useRef,useState } from 'react';
import { loadCloudPreparation,loadLocalPreparation,saveLocalPreparation,saveCloudPreparation,type ClaimPreparation,type ClaimPreparationData } from '@/lib/claim-preparations';
export function useClaimPreparation(owner:string,enabled:boolean,data:ClaimPreparationData,onRestore:(d:ClaimPreparationData)=>void,hasExplicit:boolean){
 const [status,setStatus]=useState('Loading saved preparation…');const [ready,setReady]=useState(false);const [recover,setRecover]=useState<ClaimPreparation|null>(null);
 const draft=useRef<ClaimPreparation|null>(null),latest=useRef(data),restore=useRef(onRestore),signature=useRef(''),saving=useRef(false),pending=useRef(false),conflict=useRef(false),active=useRef(true),localQueue=useRef<Promise<unknown>>(Promise.resolve());
 latest.current=data;restore.current=onRestore;
 const sig=JSON.stringify(data);
 useEffect(()=>{active.current=true;if(!enabled){setReady(false);return;}setReady(false);let cancelled=false;
  void (async()=>{try{const local=await loadLocalPreparation(owner);let cloud:ClaimPreparation|null=null;try{cloud=await loadCloudPreparation(owner,local?.id);}catch{setStatus('Cloud unavailable · device copy only');}
   if(cancelled)return;const preferred=local&&(!cloud||local.updatedAt>cloud.updatedAt)?local:cloud;
   if(preferred){draft.current=preferred;if(!hasExplicit||preferred.data.choice===latest.current.choice){signature.current=JSON.stringify(preferred.data);restore.current(preferred.data);setStatus(cloud&&preferred.revision===cloud.revision?'Saved to account':'Saved on device');}else{setRecover(preferred);draft.current=null;setStatus('Saved preparation available');}}else setStatus('Not saved yet');
  }catch{setStatus('Could not restore preparation');}finally{if(!cancelled)setReady(true);}})();return()=>{cancelled=true;active.current=false;};
 // One owner session only; changes do not reset recovery.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[owner,enabled]);
 async function persist(){if(!enabled||!ready||conflict.current)return;if(saving.current){pending.current=true;return;}saving.current=true;
  try{const d=latest.current;const previous=draft.current;const unchanged=previous&&JSON.stringify(previous.data)===JSON.stringify(d);const next:ClaimPreparation={id:previous?.id??crypto.randomUUID(),data:d,revision:previous?.revision??0,mutationId:unchanged?previous.mutationId:crypto.randomUUID(),updatedAt:unchanged?previous.updatedAt:new Date().toISOString()};draft.current=next;await saveLocalPreparation(owner,next);if(active.current)setStatus(navigator.onLine?'Saving…':'Saved on device · waiting for connection');
   if(navigator.onLine){const saved=await saveCloudPreparation(owner,next);draft.current=saved;await saveLocalPreparation(owner,saved);if(active.current)setStatus('Saved to account');}signature.current=JSON.stringify(d);
  }catch(e){const message=e instanceof Error?e.message:'Could not save';if(/another device|removed|unavailable/i.test(message)){conflict.current=true;if(active.current)setStatus('Changed elsewhere · reload before saving');}else if(active.current)setStatus('Saved on device · cloud save failed');}
  finally{saving.current=false;if(pending.current){pending.current=false;void persist();}}
 }
 useEffect(()=>{if(!enabled||!ready||signature.current===sig)return;
  const previous=draft.current;const next:ClaimPreparation={id:previous?.id??crypto.randomUUID(),data:latest.current,revision:previous?.revision??0,mutationId:crypto.randomUUID(),updatedAt:new Date().toISOString()};draft.current=next;
  localQueue.current=localQueue.current.catch(()=>{}).then(()=>saveLocalPreparation(owner,next));void localQueue.current.catch(()=>{if(active.current)setStatus('Device save failed · keep page open');});
  const timer=setTimeout(()=>void persist(),700);return()=>clearTimeout(timer);},[sig,ready,enabled]);
 useEffect(()=>{const online=()=>void persist();window.addEventListener('online',online);return()=>window.removeEventListener('online',online);});
 return {status,ready,recover,resume:()=>{if(recover){draft.current=recover;restore.current(recover.data);signature.current=JSON.stringify(recover.data);setRecover(null);}},saveNow:persist};
}