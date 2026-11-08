import { fireEvent,render,screen } from '@testing-library/react';
import { expect,it,vi } from 'vitest';
vi.mock('@/lib/store',()=>({useStore:()=>({preferences:{entities:[],assets:[]},transactions:[],accounts:[],loans:[],documents:[]})}));
vi.mock('./useBooks',()=>({useBooks:()=>({books:{properties:[],leases:[],propertyCosts:[]},save:vi.fn(),preferences:{entities:[],assets:[]}})}));
vi.mock('@/lib/investments/holdings-store',()=>({loadDemat:async()=>[]}));
vi.mock('@tanstack/react-router',()=>({useRouterState:()=>''}));
import { PropertyPanel } from './PropertyPanel';
import { DematHoldings } from '../DematHoldings';
it('the actual Investments Add holdings action opens the shared desk with investment context',async()=>{
 const event=vi.fn();window.addEventListener('ledgerline:smart-add',event);
 render(<DematHoldings/>);fireEvent.click(await screen.findByRole('button',{name:'Add holdings'}));
 expect((event.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({intent:'investments'});
 window.removeEventListener('ledgerline:smart-add',event);
});
it('both actual property upload actions open the same desk with property context and no registration form',()=>{
 const event=vi.fn();window.addEventListener('ledgerline:smart-add',event);
 render(<PropertyPanel/>);
 fireEvent.click(screen.getByRole('button',{name:'Add property from deed'}));
 fireEvent.click(screen.getByRole('button',{name:'Upload lease, tax or utility bill'}));
 expect(event.mock.calls.map(([e])=>(e as CustomEvent).detail)).toEqual([{intent:'property'},{intent:'property'}]);
 window.removeEventListener('ledgerline:smart-add',event);
});