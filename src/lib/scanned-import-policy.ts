export function importFailurePolicy(status:number|null,type:string) {
  if(type==='provider_denial'||type==='refusal'||status===404) return {status:type==='refusal'?'refused':'paused',pause:true,resume:false,retry:false};
  if(status===402||status===403) return {status:'paused',pause:true,resume:true,retry:false};
  if(status===429||(status!=null&&status>=500)) return {status:'queued',pause:false,resume:false,retry:true};
  return {status:'failed',pause:false,resume:false,retry:false};
}