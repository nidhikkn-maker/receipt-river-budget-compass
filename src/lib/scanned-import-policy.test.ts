import {expect,it} from 'vitest';
import {importFailurePolicy} from './scanned-import-policy';
it('pauses credit blocks without automated retries',()=>expect(importFailurePolicy(402,'credits')).toMatchObject({status:'paused',pause:true,retry:false}));
it('never probes provider denials',()=>expect(importFailurePolicy(403,'provider_denial')).toMatchObject({resume:false,retry:false}));
it('ends content refusals without replay',()=>expect(importFailurePolicy(200,'refusal')).toMatchObject({status:'refused',retry:false}));
it('permits later bounded rate-limit retry',()=>expect(importFailurePolicy(429,'rate')).toMatchObject({status:'queued',retry:true}));
it('does not retry invalid inputs unchanged',()=>expect(importFailurePolicy(400,'input')).toMatchObject({status:'failed',retry:false}));