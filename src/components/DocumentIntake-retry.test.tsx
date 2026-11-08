import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
const cloud=vi.hoisted(()=>({read:vi.fn(),start:vi.fn(),update:vi.fn()}));
vi.mock('@tanstack/react-start',()=>({useServerFn:()=>cloud.read}));
vi.mock('@/lib/document-extract.functions',()=>({extractDocument:vi.fn()}));
vi.mock('@tanstack/react-router',()=>({Link:({children}:{children:React.ReactNode})=><>{children}</>}));
vi.mock('@/lib/store',()=>({useStore:()=>({preferences:{entities:[],assets:[],contractObligations:[]},documents:[],accounts:[],loans:[],transactions:[]})}));
vi.mock('@/lib/image-prep',()=>({prepareForReading:async()=>({dataUrl:'data:image/png;base64,a',mimeType:'image/png'})}));
vi.mock('@/lib/books/runs',()=>({startRun:cloud.start,updateRun:cloud.update,documentIdForRun:(id:string)=>id,closeRun:vi.fn()}));
import { DocumentIntake } from './DocumentIntake';
it('failed reading retries the same parked run and checkpoints extraction before proceeding to review',async()=>{
 cloud.start.mockResolvedValue({data:{stashPath:'owner/runs/original',sha256:'digest',size:1}});cloud.update.mockResolvedValue(undefined);
 cloud.read.mockResolvedValueOnce({ok:false,error:'Temporary reader outage'}).mockResolvedValueOnce({ok:true,result:{docType:'other',fields:[],text:'source',date:null,amount:null,currency:'INR',merchant:null,notes:''}});
 render(<DocumentIntake file={new File(['a'],'original.png',{type:'image/png'})} context="documents" onClose={()=>{}} />);
 fireEvent.click(await screen.findByRole('button',{name:'Retry reading document'}));
 await screen.findByRole('button',{name:'Save to DocuRepo'});
 expect(cloud.read).toHaveBeenCalledTimes(2);expect(cloud.start.mock.calls[0]?.[0]).toBe(cloud.start.mock.calls[1]?.[0]);
 await waitFor(()=>expect(cloud.update).toHaveBeenCalledWith(cloud.start.mock.calls[0]?.[0],expect.objectContaining({stage:'Validate',data:expect.objectContaining({read:expect.objectContaining({text:'source'}),stashPath:'owner/runs/original'})})));
});
it('reopens a checkpointed reading without calling extraction again',async()=>{
 cloud.read.mockClear();cloud.start.mockResolvedValue({data:{stashPath:'owner/runs/kept',read:{docType:'other',fields:[],text:'retained source',date:null,amount:null,currency:'INR'},docType:'other',fields:[]}});
 render(<DocumentIntake file={new File(['b'],'kept.png',{type:'image/png'})} context="investments" onClose={()=>{}} />);
 await screen.findByRole('button',{name:'Save to DocuRepo'});
 expect(cloud.read).not.toHaveBeenCalled();
});