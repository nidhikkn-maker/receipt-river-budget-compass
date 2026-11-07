import {describe,it,expect,vi} from 'vitest';
import {indexedDB} from 'fake-indexeddb';
vi.mock('@/integrations/supabase/client',()=>({supabase:{}}));
import {saveLocalPreparation,loadLocalPreparation,clearLocalPreparations,type ClaimPreparation} from './claim-preparations';
globalThis.indexedDB=indexedDB;
const draft:ClaimPreparation={id:'test',revision:2,mutationId:'test',updatedAt:'2026-11-01T06:00:00Z',data:{choice:'trip:t',picked:['e'],excluded:['excluded'],organisation:'AET',profileId:'role',routeId:'route',accountId:'bank',claimant:{name:'Private claimant',designation:'Director',employeeId:'',department:'',email:'',approver:'',bankDetails:''},purpose:'Meeting',from:'2026-10-01',to:'2026-10-03',format:'summary',rejected:['wrong']}};
describe('Encrypted claim preparation recovery',()=>{
 it('restores selections, claimant and organisation only for the same owner',async()=>{await saveLocalPreparation('claim-owner',draft);expect(await loadLocalPreparation('claim-owner')).toEqual(draft);expect(await loadLocalPreparation('other-owner')).toBeNull();});
 it('stores no plaintext claimant and cannot be decrypted by another owner',async()=>{const db=await new Promise<IDBDatabase>(r=>{const request=indexedDB.open('ledgerline-claim-preparations',1);request.onsuccess=()=>r(request.result);});const sealed=await new Promise<{bytes:ArrayBuffer}>(r=>{const q=db.transaction('drafts').objectStore('drafts').get('claim-owner');q.onsuccess=()=>r(q.result);});expect(new TextDecoder().decode(sealed.bytes)).not.toContain('Private claimant');db.close();});
 it('owner cleanup deletes only their preparation',async()=>{await saveLocalPreparation('other-owner',draft);await clearLocalPreparations('claim-owner');expect(await loadLocalPreparation('claim-owner')).toBeNull();expect(await loadLocalPreparation('other-owner')).toEqual(draft);});
});