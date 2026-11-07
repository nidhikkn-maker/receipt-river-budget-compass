import { Button } from './ui/button';
import { Dialog,DialogContent,DialogTitle,DialogDescription,DialogFooter } from './ui/dialog';
import { reviewSectionLabel } from '@/lib/preference-review';
export function PreferenceReview({sections,onDecision}:{sections:string[]|null;onDecision:(approved:boolean)=>void}){
 return <Dialog open={sections!==null} onOpenChange={open=>{if(!open)onDecision(false);}}><DialogContent><DialogTitle>Approve financial changes</DialogTitle><DialogDescription>Changed records and settings</DialogDescription><ul className="list-disc space-y-1 pl-5 text-sm">{sections?.map(k=><li key={k}>{reviewSectionLabel(k)}</li>)}</ul><DialogFooter><Button variant="outline" onClick={()=>onDecision(false)}>Cancel</Button><Button onClick={()=>onDecision(true)}>Approve &amp; save</Button></DialogFooter></DialogContent></Dialog>;
}