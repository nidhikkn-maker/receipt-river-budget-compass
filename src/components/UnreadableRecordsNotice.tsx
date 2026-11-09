import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { downloadBlob } from "@/lib/reports";

/**
 * Saved records the app cannot display are never deleted: they stay in storage unchanged (preserve-records.ts).
 * This notice tells the owner they exist and lets them download them for review. It changes nothing.
 */
export function UnreadableRecordsNotice() {
  const unreadableRecords = useStore().unreadableRecords ?? [];
  if (!unreadableRecords.length) return null;
  const n = unreadableRecords.length;
  const download = () => downloadBlob(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), note: "Saved records Thapal could not display. They are kept unchanged in your account.", records: unreadableRecords }, null, 2)], { type: "application/json" }), "thapal-records-to-review.json");
  return (
    <Alert role="status">
      <AlertTitle>{n} saved {n === 1 ? "record needs" : "records need"} review</AlertTitle>
      <AlertDescription>
        <p>Thapal couldn't display {n === 1 ? "this record" : "these records"}, so {n === 1 ? "it is" : "they are"} kept exactly as saved and never deleted. Download them to check with your accountant.</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={download}>Download records to review</Button>
      </AlertDescription>
    </Alert>
  );
}
