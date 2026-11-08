// @vitest-environment node
// Synthetic upload controller checks; no hosted writes or policy activation.
import { expect, it } from 'vitest';
import { applyUpload, PartialUploadError, type ApplyApi, type ApplyResult } from './apply';
import { buildPlan } from './plan';
import { fromStatementLines } from './line';
import { defaultPreferences } from '../preferences';
import { mergeUploadHistory } from './history';
import { atomicStatementUndo } from './atomic-undo';

it('captures original revision during upload, persists it, and refuses later same-source edits at Undo', async () => {
  const account = { id:'bank', name:'Synthetic bank', kind:'savings' as const, openingBalance:1000, archived:false };
  const file = { name:'snapshot.csv', currency:'INR', accountId:'bank', hint:null, opening:null, closing:null, lines:fromStatementLines('snapshot.csv',[{ref:'one',date:'2026-10-02',description:'SWIGGY ORDER',amount:250}]) };
  const reviewed = buildPlan([file],[account],[],[{name:'Food',archived:false}]).accounts[0];
  if (!reviewed) throw Error('Missing plan');
  let row: Record<string,unknown> | undefined;
  let history = defaultPreferences();
  const api: ApplyApi = {
    transactions:[], addAccount:async()=>{throw Error('Unexpected account');}, setArchived:async()=>{}, remove:async()=>{}, refresh:async()=>{},
    prepareSource:async()=> 'original',
    save:async(input,opts)=>{row={id:opts?.createId,amount:input.amount,statement_ref:null,correction_revision:0};},
    reconcile:async(_id,ref)=>{if(row){row['statement_ref']=ref;row['correction_revision']=Number(row['correction_revision'])+1;}},
    readUndoRow:async(id)=>row ? {id,ref:row['statement_ref'] as string|null,revision:Number(row['correction_revision'])} : null,
    checkpoint:async(r)=>{history=mergeUploadHistory(history,{...r,id:'upload',at:'2026-11-08',label:file.name,status:'interrupted'});},
  };
  const result=await applyUpload([{account:reviewed,decisions:[...reviewed.auto,...reviewed.ask],reconcileIds:[]}],api);
  expect(result.undoRows?.[0]?.revision).toBe(1);
  expect(history.statementUploads?.[0]?.undoRows).toEqual(result.undoRows);
  if(!row)throw Error('No saved row');
  row['amount']=251;row['correction_revision']=2;
  const forged={...result,undoRows:[{...result.undoRows?.[0],id:String(row['id']),ref:String(row['statement_ref']),revision:2}]};
  history=mergeUploadHistory(history,{...forged,id:'upload',at:'2026-11-08',label:file.name,status:'complete'});
  expect(history.statementUploads?.[0]?.undoRows?.[0]?.revision).toBe(1);
  let commits=0;
  await expect(atomicStatementUndo('upload',result,history.statementUploads?.[0]?.undoRows??[],{receipt:async()=>false,rows:async()=>row?[row]:[],commit:async()=>{commits++;}})).rejects.toThrow('changed');
  expect(commits).toBe(0);
});

it('a failed upload-time owner read remains interrupted and never adopts a later baseline', async()=>{
  const account={id:'bank',name:'Synthetic bank',kind:'savings' as const,openingBalance:1000,archived:false};
  const file={name:'failed.csv',currency:'INR',accountId:'bank',hint:null,opening:null,closing:null,lines:fromStatementLines('failed.csv',[{ref:'one',date:'2026-10-02',description:'SWIGGY ORDER',amount:250}])};
  const plan=buildPlan([file],[account],[],[{name:'Food',archived:false}]).accounts[0];if(!plan)throw Error('No plan');
  let saves=0,links=0;let last:ApplyResult|undefined;
  try{await applyUpload([{account:plan,decisions:[...plan.auto,...plan.ask],reconcileIds:[]}],{transactions:[],save:async()=>{saves++;},readUndoRow:async()=>null,reconcile:async()=>{links++;},remove:async()=>{},addAccount:async()=>'',setArchived:async()=>{},refresh:async()=>{},checkpoint:async(r)=>{last=r;}});throw Error('Expected interruption');}
  catch(error){expect(error).toBeInstanceOf(PartialUploadError);if(error instanceof PartialUploadError)expect(error.result.posted).toHaveLength(1);}
  expect(saves).toBe(1);expect(links).toBe(0);expect(last?.undoRows).toBeUndefined();
});