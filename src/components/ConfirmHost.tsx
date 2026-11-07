import { useEffect, useState } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { settleConfirm, subscribeConfirm, type ConfirmRequest } from '@/lib/confirm';

export function ConfirmHost() {
  const [req, setReq] = useState<ConfirmRequest | null>(null);
  useEffect(() => subscribeConfirm(setReq), []);
  return <AlertDialog open={!!req} onOpenChange={open => { if (!open && req) settleConfirm(false); }}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{req?.title ?? 'Please confirm'}</AlertDialogTitle>
        <AlertDialogDescription className="break-words">{req?.message}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel onClick={() => settleConfirm(false)}>{req?.cancelLabel ?? 'Cancel'}</AlertDialogCancel>
        <AlertDialogAction onClick={() => settleConfirm(true)}>{req?.confirmLabel ?? 'Continue'}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
