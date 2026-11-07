import { expect, it } from 'vitest';
import { cleanPayees, payeeDraft, validatePayee, type Payee } from './payees';
import { defaultPreferences, normalizePreferences } from './preferences';
const payee:Payee={id:'external',name:'Supplier',type:'business',identifiers:[],accountDetails:'',accountVerified:false,organisation:'',preferredCategory:'',archived:false};
it('external individual needs a name, not an internally configured account or bank details',()=>{
  expect(validatePayee({...payee,type:'individual'})).toMatchObject({name:'Supplier',accountDetails:'',identifiers:[]});
  expect(payeeDraft(payee)).toEqual({merchant:'Supplier'});
});
it('unknown information stays blank and directory survives preferences serialization',()=>{
  const restored=normalizePreferences(JSON.parse(JSON.stringify({...defaultPreferences(),payees:[payee]})));
  expect(restored.payees).toEqual([payee]);
  expect(restored.payees[0]?.accountVerified).toBe(false);
});
it('unprovided account details cannot be marked verified',()=>expect(()=>validatePayee({...payee,accountVerified:true})).toThrow('verified'));
it('duplicate recipient of same type is refused without deleting existing recipients',()=>expect(()=>validatePayee({...payee,id:'other',name:' supplier '},[payee])).toThrow('already exists'));
it('archived recipients cannot populate new drafts',()=>expect(()=>payeeDraft({...payee,archived:true})).toThrow('active'));
it('invalid saved recipients do not invent a name or corrupt the valid directory',()=>expect(cleanPayees([null,{id:'unknown'},payee])).toEqual([payee]));
it('recipient selection never grants category, workspace, account or reimbursement responsibility',()=>expect(payeeDraft({...payee,preferredCategory:'Office & Supplies',organisation:'External business'})).toEqual({merchant:'Supplier'}));