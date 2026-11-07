// @vitest-environment node
// Controlled SDK only: complements opt-in ACTUAL extraction acceptance, not a provider accuracy test.
import { beforeEach,expect,it,vi } from 'vitest';
const call=vi.hoisted(()=>vi.fn());
vi.mock('@lovable.dev/ai-gateway',()=>({streamResponse:call}));
import { readStatementWithAI } from './statement-reader.server';
beforeEach(()=>call.mockReset());
it('streamed statement row output is validated and never accepts a fabricated impossible date',async()=>{
 call.mockResolvedValue((async function*(){yield {type:'response.output_text.delta',delta:JSON.stringify({rows:[{date:'2026-02-30',description:'bad date',amount:250,direction:'debit'},{date:'2026-10-02',description:'SWIGGY',amount:250,direction:'debit'}]})};})());
 expect(await readStatementWithAI('data:image/jpeg;base64,synthetic','image/jpeg')).toEqual([{ref:'OCR2',date:'2026-10-02',description:'SWIGGY',amount:250,direction:'debit'}]);
 expect(call).toHaveBeenCalledTimes(1);expect(call.mock.calls[0]?.[0].model).toBe('openai/gpt-6-astra');
});
it('an interrupted extraction propagates once, never automatically replays or returns incomplete financial rows',async()=>{
 call.mockResolvedValue((async function*(){yield {type:'response.output_text.delta',delta:'{"rows":['};throw Error('network interrupted');})());
 await expect(readStatementWithAI('data:application/pdf;base64,synthetic','application/pdf')).rejects.toThrow('network interrupted');expect(call).toHaveBeenCalledTimes(1);
});