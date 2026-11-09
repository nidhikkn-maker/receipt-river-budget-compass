import { supabase } from "@/integrations/supabase/client";
import { clearOfflineOwner } from "./offline";
import { clearLocalPreparations } from './claim-preparations';
import { StepUpCancelled, withStepUp } from './step-up';

/** Discover all owner files before deleting rows; a failed record deletion never removes files. */
export async function deleteFinanceData(owner: string): Promise<void> {
  if (!navigator.onLine) throw new Error("Reconnect to the internet before deleting your data.");
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user || data.user.id !== owner) throw new Error("Please sign in again before deleting your data.");
  const paths: string[] = [];
  const walk = async (folder: string): Promise<void> => {
    for (let offset = 0; ; offset += 100) {
      const result = await supabase.storage.from("receipts").list(folder, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
      if (result.error) throw new Error("Couldn't check your receipt files. Nothing was deleted; please retry.");
      for (const item of result.data ?? []) {
        const path = `${folder}/${item.name}`;
        if (item.id) paths.push(path);
        else await walk(path);
      }
      if ((result.data?.length ?? 0) < 100) break;
    }
  };
  await walk(owner);
  // Needs a fresh re-confirmation; if it expired while files were listed, confirm and retry once.
  let removed;
  try { removed = await withStepUp(() => supabase.rpc("delete_my_finance_data")); }
  catch (e) { if (e instanceof StepUpCancelled) throw new Error("Deletion needs you to confirm it's you. Nothing was deleted."); throw e; }
  if (removed.error) throw new Error("Couldn't delete your records. Your files were kept; please retry.");
  let filesFailed = false;
  for (let offset = 0; offset < paths.length; offset += 100) {
    try {
      const result = await supabase.storage.from("receipts").remove(paths.slice(offset, offset + 100));
      if (result.error) filesFailed = true;
    } catch { filesFailed = true; }
  }
  try { await clearLocalPreparations(owner); await clearOfflineOwner(owner); }
  catch { throw new Error("Online records were deleted, but this device's offline data couldn't be cleared. Keep this device online and retry."); }
  if (filesFailed) throw new Error("Records were deleted, but some receipt files couldn't be removed. Retry to finish deleting them.");
}