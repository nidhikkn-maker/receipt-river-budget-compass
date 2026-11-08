import {accountingCanonical} from './accounting-post';
export interface AccountantNote {id:string;owner:string;journal:string;finding:string;note:string;attempted?:boolean;}
export async function saveAccountantNote(p:AccountantNote,io:{write:()=>Promise<void>;read:()=>Promise<AccountantNote|null>}){
 const verify=(r:AccountantNote)=>{const {attempted:_a,...left}=p;const {attempted:_b,...right}=r;if(accountingCanonical(left)!==accountingCanonical(right))throw Error('Saved review differs; retain the original note.');};
 const existing=await io.read();if(existing){verify(existing);return;}
 let failure:unknown;try{await io.write();}catch(e){failure=e;}
 const saved=await io.read();if(saved){verify(saved);return;}throw failure??Error('Review save is unconfirmed. Retry the retained note.');
}