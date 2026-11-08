import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({entry:{id:'expense',title:'Claim hotel',date:'2026-11-01',originalAmount:1200.25,amount:1200.25,currency:'INR',fxRate:1,category:'Hotels',paymentMethod:'bank_transfer',accountId:'bank',merchant:'Hotel',description:'Printed source',receipts:[] as {path:string;name:string;type:string}[],tags:[]}}));
vi.mock('@/lib/store',()=>({useStore:()=>({transactions:[state.entry],accounts:[],preferences:{paymentInstruments:[]},memberName:()=>'',signedUrl:async()=>''})}));
vi.mock('./ui/sheet',()=>({Sheet:({children}:{children:React.ReactNode})=><>{children}</>,SheetContent:({children}:{children:React.ReactNode})=><div>{children}</div>,SheetHeader:({children}:{children:React.ReactNode})=><div>{children}</div>,SheetTitle:({children}:{children:React.ReactNode})=><h2>{children}</h2>,SheetDescription:({children}:{children:React.ReactNode})=><p>{children}</p>}));
vi.mock('@/routes/_authenticated/new',()=>({NewExpense:({embedded}:{embedded:{search:{edit:string};onExit:()=>void}})=><button onClick={()=>{state.entry={...state.entry,receipts:[{path:'owner/bill.pdf',name:'bill.pdf',type:'application/pdf'}]};embedded.onExit();}}>Save bill for {embedded.search.edit}</button>}));
import { ClaimExpenseDetails } from './ClaimExpenseDetails';
it('edits the exact existing expense in place and reads refreshed bill evidence without leaving the claim',async()=>{
 render(<ClaimExpenseDetails entry={state.entry as never} onClose={()=>{}} />);
 fireEvent.click(screen.getByRole('button',{name:'Edit expense / add bill'}));
 fireEvent.click(await screen.findByRole('button',{name:'Save bill for expense'}));
 expect(await screen.findByRole('button',{name:'bill.pdf'})).toBeTruthy();
 expect(screen.queryByRole('button',{name:'Save bill for expense'})).toBeNull();
 expect(state.entry.amount).toBe(1200.25);
});