import { Camera, FileUp, Mic, PencilLine, MessageSquare } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import type { Scope } from '@/lib/expenses';

export function SmartAdd({ open, onOpenChange, scope }: { open: boolean; onOpenChange: (open: boolean) => void; scope?: Scope | undefined }) {
  const navigate = useNavigate();
  const entry = (mode: 'scan' | 'voice' | 'quick' | 'message') => {
    onOpenChange(false);
    void navigate({ to: '/new', search: { mode, ...(scope ? { scope } : {}) } });
  };
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="smart-add-sheet native-sheet max-h-[85dvh] overflow-y-auto sm:max-w-md">
      <DialogHeader><DialogTitle>Smart Add</DialogTitle><DialogDescription>Show me your receipt, statement or message — or tell me what happened. I'll explain what I found before anything is saved.{scope ? ` Adding to ${scope.charAt(0).toUpperCase()}${scope.slice(1)}.` : ''}</DialogDescription></DialogHeader>
      <div className="grid gap-2">
        <Button variant="outline" className="h-14 justify-start gap-3" onClick={() => entry('scan')}><Camera className="size-5 text-primary" />Scan / Photo</Button>
        <Button variant="outline" className="h-14 justify-start gap-3" onClick={() => { onOpenChange(false); void navigate({ to: '/statements' }); }}><FileUp className="size-5 text-primary" />Upload File</Button>
        <Button variant="outline" className="h-14 justify-start gap-3" onClick={() => entry('voice')}><Mic className="size-5 text-primary" />Voice</Button>
        <Button variant="outline" className="h-14 justify-start gap-3" onClick={() => entry('quick')}><PencilLine className="size-5 text-primary" />Quick Entry</Button>
        <Button variant="outline" className="h-14 justify-start gap-3" onClick={() => entry('message')}><MessageSquare className="size-5 text-primary" />From Message</Button>
      </div>
    </DialogContent>
  </Dialog>;
}