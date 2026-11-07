// @vitest-environment node
// Controlled service adapter only; never calls hosted storage or database.
import { expect, it, vi } from 'vitest';
import { completeReportJob } from './report-jobs.server';
import { emptyFilters } from './report-centre';
vi.mock('./report-pdf',()=>({renderReportPdf:async()=>new Blob(['%PDF-original'],{type:'application/pdf'})}));
const job={id:'job',owner_id:'owner',kind:'monthly',filters:emptyFilters('2026-11-01','2026-11-30'),style:'simple'};
function adapter(options:{history?:Record<string,unknown>;readError?:boolean;insertLost?:boolean;doneError?:boolean}={}) {
 let history=options.history;const writes:unknown[]=[];const files=new Map<string,Blob>();
 const db={from:(table:string)=>{
  let action='select',payload:unknown;const filters:Record<string,unknown>={};let head=false;
  const q={select:(_s:string,o?:{head?:boolean})=>{head=!!o?.head;return q;},eq:(k:string,v:unknown)=>{filters[k]=v;return q;},update:(value:unknown)=>{action='update';payload=value;return q;},insert:(value:unknown)=>{action='insert';payload=value;return q;},maybeSingle:()=>run(true),then:(resolve:(value:unknown)=>unknown,reject?:(reason:unknown)=>unknown)=>run(false).then(resolve,reject)};
  async function run(single:boolean){
   if(table==='report_history'){
    if(action==='insert'){history=payload as Record<string,unknown>;writes.push(payload);return {error:options.insertLost?{message:'Lost response'}:null};}
    if(options.readError)return {data:null,error:{message:'Read failed'}};
    return {data:head?null:(single?history??null:[]),count:history?1:0,error:null};
   }
   if(action==='update'){writes.push({table,payload,filters});return {error:options.doneError?{message:'Status failed'}:null};}
   return {data:single?null:[],error:null};
  }return q;
 },storage:{from:()=>({upload:async(path:string,blob:Blob,opts:{upsert:boolean})=>{expect(opts.upsert).toBe(false);if(files.has(path))return {error:{message:'already exists'}};files.set(path,blob);return {error:null};},download:async(path:string)=>({data:files.get(path),error:null})})}};
 return {db:db as unknown as Parameters<typeof completeReportJob>[0],writes,files,getHistory:()=>history};
}
it('existing accepted owner report completes without rendering/upload; read errors and wrong identity never mark done',async()=>{
 const row={id:'job',owner_id:'owner',kind:'monthly',file_path:'owner/reports/job.pdf',file_size:13};
 const valid=adapter({history:{...row,period_from:job.filters.from,period_to:job.filters.to,filters:{style:job.style}}});valid.files.set('owner/reports/job.pdf',new Blob(['%PDF-original'],{type:'application/pdf'}));await completeReportJob(valid.db,job);expect(valid.files.size).toBe(1);expect(valid.writes).toHaveLength(1);
 const failed=adapter({readError:true});await expect(completeReportJob(failed.db,job)).rejects.toThrow('check report history');expect(failed.writes).toEqual([]);
 const wrong=adapter({history:{...row,owner_id:'someone-else'}});await expect(completeReportJob(wrong.db,job)).rejects.toThrow('identity');expect(wrong.writes).toEqual([]);
});
it('lost history response reads back exact report and retry never overwrites evidence',async()=>{
 const h=adapter({insertLost:true});await completeReportJob(h.db,job);const stored=h.files.get('owner/reports/job.pdf');
 expect(await stored?.text()).toBe('%PDF-original');expect(h.getHistory()).toMatchObject({id:'job',owner_id:'owner',file_size:13});
 await completeReportJob(h.db,job);expect(h.files.size).toBe(1);expect(h.writes.filter(x=>(x as {id?:string}).id==='job')).toHaveLength(1);
});
it('completion failure retains checksum-bound evidence and a later retry marks done without replacement',async()=>{
 const options={doneError:true};const h=adapter(options);
 await expect(completeReportJob(h.db,job)).rejects.toThrow('completion status');
 const original=h.files.get('owner/reports/job.pdf');expect(h.getHistory()?.['filters']).toMatchObject({evidenceSha256:expect.stringMatching(/^[a-f0-9]{64}$/)});
 options.doneError=false;await completeReportJob(h.db,job);
 expect(h.files.get('owner/reports/job.pdf')).toBe(original);
 expect(h.writes.filter(x=>(x as {id?:string}).id==='job')).toHaveLength(1);
});
it('same-size corruption and unavailable accepted evidence never mark done',async()=>{
 const h=adapter();await completeReportJob(h.db,job);const before=h.writes.length;
 h.files.set('owner/reports/job.pdf',new Blob(['%PDF-corrupt!'],{type:'application/pdf'}));
 await expect(completeReportJob(h.db,job)).rejects.toThrow('checksum');expect(h.writes).toHaveLength(before);
 h.files.clear();await expect(completeReportJob(h.db,job)).rejects.toThrow('unavailable');expect(h.writes).toHaveLength(before);
});
it('orphan PDF is adopted unchanged before new ledger reads or rendering',async()=>{
 const h=adapter();const original=new Blob(['%PDF-frozen-before-retry'],{type:'application/pdf'});h.files.set('owner/reports/job.pdf',original);
 await completeReportJob(h.db,job);
 expect(h.files.get('owner/reports/job.pdf')).toBe(original);expect(h.getHistory()?.['file_size']).toBe(original.size);
});