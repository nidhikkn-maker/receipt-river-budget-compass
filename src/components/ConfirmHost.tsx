import { useEffect, useState } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { settleConfirm, subscribeConfirm, type ConfirmRequest } from '@/lib/confirm';
import { useAppLocked } from '@/lib/app-lock-state';

export function ConfirmHost() {
  const [req, setReq] = useState<ConfirmRequest | null>(null);
  useEffect(() => subscribeConfirm(setReq), []);
  // A question still open when the app locks is answered "no" and closed: nothing proceeds behind the lock.
  const locked = useAppLocked();
  useEffect(() => { if (locked && req) settleConfirm(false); }, [locked, req]);
  return <AlertDialog open={!!req && !locked} onOpenChange={open => { if (!open && req) settleConfirm(false); }}>
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
