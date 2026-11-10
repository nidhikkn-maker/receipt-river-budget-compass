import { useStore } from "@/lib/store";
import { loadAreaList } from "@/lib/load-state";
import { LoadError } from "./LoadError";

/** Shown on every signed-in screen while any record group failed to load (P0-017). */
export function StoreLoadNotice() {
  const { loadErrors, refresh } = useStore();
  if (!loadErrors?.length) return null;
  return <LoadError className="mb-4" what={`your ${loadAreaList(loadErrors)}`} onRetry={refresh}
    note="Nothing has been deleted. Totals and lists here may be incomplete until they load. Check your connection and retry." />;
}
