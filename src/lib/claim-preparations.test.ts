import {describe,it,expect,vi} from 'vitest';
import {indexedDB} from 'fake-indexeddb';
vi.mock('@/integrations/supabase/client',()=>({supabase:{}}));
import {saveLocalPreparation,loadLocalPreparation,clearLocalPreparations,saveLocalClaimReport,loadLocalClaimReport,clearLocalClaimReport,resolveClaimReportVersion,type ClaimPreparation,type ClaimReportJob} from './claim-preparations';
globalThis.indexedDB=indexedDB;
const draft:ClaimPreparation={id:'test',revision:2,mutationId:'test',updatedAt:'2026-11-01T06:00:00Z',data:{choice:'trip:t',picked:['e'],excluded:['excluded'],organisation:'AET',profileId:'role',routeId:'route',accountId:'bank',claimant:{name:'Private claimant',designation:'Director',employeeId:'',department:'',email:'',approver:'',bankDetails:''},purpose:'Meeting',from:'2026-10-01',to:'2026-10-03',format:'summary',rejected:['wrong']}};
describe('Encrypted claim preparation recovery',()=>{
 it('Reports Centre recovery has a separate encrypted slot and owner cleanup removes both pending reports',async()=>{
  const job:ClaimReportJob={id:'centre',path:'slot-owner/reports/centre.pdf',name:'monthly.pdf',activity:'monthly',bytes:[37,80,68,70],missing:[],row:{id:'centre',owner_id:'slot-owner',kind:'monthly',title:'Monthly',file_path:'slot-owner/reports/centre.pdf',file_size:4}};
  await saveLocalClaimReport('slot-owner',job,'centre-report');await saveLocalClaimReport('slot-owner',{...job,id:'claim'});
  expect((await loadLocalClaimReport('slot-owner','centre-report'))?.id).toBe('centre');expect((await loadLocalClaimReport('slot-owner'))?.id).toBe('claim');expect(await loadLocalClaimReport('unrelated-owner','centre-report')).toBeNull();
  await clearLocalPreparations('slot-owner');expect(await loadLocalClaimReport('slot-owner','centre-report')).toBeNull();expect(await loadLocalClaimReport('slot-owner')).toBeNull();
 });
 it('retains frozen bytes after failed version lookup and resolves one version on retry',async()=>{
  const job:ClaimReportJob={id:'version-report',path:'version-owner/reports/version-report.pdf',name:'claim.pdf',activity:'entries:e',bytes:[37,80,68,70],missing:[],versionPending:true,row:{id:'version-report',owner_id:'version-owner',kind:'claim-submission',title:'Claim · v1 — Purchase',file_path:'version-owner/reports/version-report.pdf',file_size:4,version:1}};
  await saveLocalClaimReport('version-owner',job);
  await expect(resolveClaimReportVersion(job,async()=>{throw Error('Interrupted');},j=>saveLocalClaimReport('version-owner',j))).rejects.toThrow('Interrupted');
  expect(await loadLocalClaimReport('version-owner')).toEqual(job);
  const read=vi.fn(async()=>3);const resolved=await resolveClaimReportVersion(job,read,j=>saveLocalClaimReport('version-owner',j));
  expect(resolved.row.version).toBe(3);expect(resolved.bytes).toEqual([37,80,68,70]);expect(resolved.id).toBe('version-report');
  expect(await loadLocalClaimReport('version-owner')).toEqual(resolved);
  await resolveClaimReportVersion(resolved,read,async()=>{});expect(read).toHaveBeenCalledTimes(1);
 });
 it('keeps the exact frozen PDF and identity owner-private for interrupted retry',async()=>{
  const job:ClaimReportJob={id:'report',path:'owner/reports/report.pdf',name:'claim.pdf',activity:'entries:e',bytes:[37,80,68,70],missing:[],row:{id:'report',owner_id:'job-owner',kind:'claim-submission',title:'Claim',file_path:'owner/reports/report.pdf',file_size:4}};
  await saveLocalClaimReport('job-owner',job);expect(await loadLocalClaimReport('job-owner')).toEqual(job);expect(await loadLocalClaimReport('other-owner')).toBeNull();await clearLocalClaimReport('job-owner');expect(await loadLocalClaimReport('job-owner')).toBeNull();
 });
 it('restores selections, claimant and organisation only for the same owner',async()=>{await saveLocalPreparation('claim-owner',draft);expect(await loadLocalPreparation('claim-owner')).toEqual(draft);expect(await loadLocalPreparation('other-owner')).toBeNull();});
 it('stores no plaintext claimant and cannot be decrypted by another owner',async()=>{const db=await new Promise<IDBDatabase>(r=>{const request=indexedDB.open('ledgerline-claim-preparations',1);request.onsuccess=()=>r(request.result);});const sealed=await new Promise<{bytes:ArrayBuffer}>(r=>{const q=db.transaction('drafts').objectStore('drafts').get('claim-owner');q.onsuccess=()=>r(q.result);});expect(new TextDecoder().decode(sealed.bytes)).not.toContain('Private claimant');db.close();});
 it('owner cleanup deletes only their preparation',async()=>{await saveLocalPreparation('other-owner',draft);await clearLocalPreparations('claim-owner');expect(await loadLocalPreparation('claim-owner')).toBeNull();expect(await loadLocalPreparation('other-owner')).toEqual(draft);});
});