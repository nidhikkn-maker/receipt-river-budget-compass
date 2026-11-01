import { act, renderHook, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClaimPreparation, ClaimPreparationData } from '@/lib/claim-preparations';
const api=vi.hoisted(()=>({loadLocalPreparation:vi.fn(),loadCloudPreparation:vi.fn(),saveLocalPreparation:vi.fn(),saveCloudPreparation:vi.fn()}));
vi.mock('@/lib/claim-preparations',()=>api);
import { useClaimPreparation } from './useClaimPreparation';
const data:ClaimPreparationData={choice:'trip:t',picked:[],excluded:[],organisation:'AET',profileId:'',routeId:'',accountId:'',claimant:{name:'Test',designation:'Role',employeeId:'',department:'',email:'',approver:'',bankDetails:''},purpose:'Original',from:'',to:'',format:'summary',rejected:[]};
const initial:ClaimPreparation={id:'draft',data,revision:1,mutationId:'first',updatedAt:'2026-11-01T06:00:00Z'};
beforeEach(()=>{vi.resetAllMocks();api.loadLocalPreparation.mockResolvedValue(initial);api.loadCloudPreparation.mockResolvedValue(initial);api.saveLocalPreparation.mockResolvedValue(undefined);api.saveCloudPreparation.mockImplementation(async(_owner,p)=>({...p,revision:p.revision+1}));Object.defineProperty(navigator,'onLine',{configurable:true,value:true});});
afterEach(()=>cleanup());
describe('Claim preparation save recovery',()=>{
 it('preserves a newer edit while an earlier account save finishes',async()=>{
  let complete:(p:ClaimPreparation)=>void=()=>{};
  api.saveCloudPreparation.mockImplementationOnce(()=>new Promise<ClaimPreparation>(r=>{complete=r;}));
  const {result,rerender}=renderHook(({value})=>useClaimPreparation('owner',true,value,()=>{},false),{initialProps:{value:data}});
  await waitFor(()=>expect(result.current.ready).toBe(true));
  const first={...data,purpose:'First edit'};rerender({value:first});
  let saving:Promise<void>=Promise.resolve();act(()=>{saving=result.current.saveNow();});
  await waitFor(()=>expect(api.saveCloudPreparation).toHaveBeenCalledTimes(1));
  const sent=api.saveCloudPreparation.mock.calls[0][1] as ClaimPreparation;
  const newest={...data,purpose:'Latest edit'};rerender({value:newest});
  await waitFor(()=>expect(api.saveLocalPreparation.mock.calls.at(-1)?.[1].data.purpose).toBe('Latest edit'));
  await act(async()=>{complete({...sent,revision:2});await saving;});
  await waitFor(()=>expect(api.saveCloudPreparation).toHaveBeenCalledTimes(2));
  const next=api.saveCloudPreparation.mock.calls[1][1] as ClaimPreparation;
  expect(next.data.purpose).toBe('Latest edit');expect(next.revision).toBe(2);
  await waitFor(()=>expect(api.saveLocalPreparation.mock.calls.at(-1)?.[1].data.purpose).toBe('Latest edit'));
 });
 it('does not describe an unsaved device copy as saved when device storage fails',async()=>{
  const {result,rerender}=renderHook(({value})=>useClaimPreparation('owner',true,value,()=>{},false),{initialProps:{value:data}});
  await waitFor(()=>expect(result.current.ready).toBe(true));api.saveLocalPreparation.mockRejectedValue(Error('Storage denied'));
  rerender({value:{...data,purpose:'Unsaved edit'}});await act(async()=>{await result.current.saveNow();});
  expect(result.current.status).toMatch(/device save failed/i);expect(api.saveCloudPreparation).not.toHaveBeenCalled();
 });
 it('restored offline edits sync on reopening online without another edit',async()=>{
  const local={...initial,data:{...data,purpose:'Offline edit'},mutationId:'offline',updatedAt:'2026-11-01T06:10:00Z'};api.loadLocalPreparation.mockResolvedValue(local);
  let restored=data;const {result,rerender}=renderHook(({value})=>useClaimPreparation('owner',true,value,d=>{restored=d;},false),{initialProps:{value:data}});
  await waitFor(()=>expect(result.current.ready).toBe(true));rerender({value:restored});
  await waitFor(()=>expect(api.saveCloudPreparation).toHaveBeenCalled());expect(api.saveCloudPreparation.mock.calls[0][1].data.purpose).toBe('Offline edit');
 });
});