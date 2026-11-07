import { createContext, useContext, useState, type ReactNode } from "react";
import { defaultPreferences } from "../../src/lib/preferences";
import type { PendingItem } from "../../src/lib/pending-sync";

const initial: PendingItem[] = [
  { id: "queued-failed", date: "2026-11-01", payee: "Controlled cafe", title: "Team lunch", amount: 432.1, currency: "INR", createdAt: "2026-11-01T10:00:00Z", status: "failed", error: "No connection" },
  { id: "queued-waiting", date: "2026-10-31", payee: "Controlled print shop", title: "Stationery", amount: 1200, currency: "INR", createdAt: "2026-10-31T09:00:00Z", status: "waiting" },
];
const fixture = ((window as unknown as { syncQueueBrowserFixture?: { items: PendingItem[]; removed: string[]; retried: string[] } }).syncQueueBrowserFixture ??= {
  items: JSON.parse(sessionStorage.getItem("sync-queue-browser-fixture") ?? JSON.stringify(initial)) as PendingItem[],
  removed: [] as string[], retried: [] as string[],
});
Object.assign(window, { syncQueueBrowserFixture: fixture });
const Context = ((window as unknown as { isolatedSyncQueueContext?: ReturnType<typeof createContext<ReturnType<typeof makeStore> | null>> }).isolatedSyncQueueContext ??= createContext<ReturnType<typeof makeStore> | null>(null));

function makeStore(update: (next: PendingItem[]) => void) {
  return {
    userId: "controlled-owner", preferences: defaultPreferences(), name: "Me", memberName: () => "Me",
    pendingItems: fixture.items, pendingCount: fixture.items.length,
    retrySync: async (id?: string) => { if (id) fixture.retried.push(id); else fixture.retried.push("all"); },
    discardPending: async (id: string) => {
      fixture.removed.push(id);
      fixture.items = fixture.items.filter((p) => p.id !== id);
      sessionStorage.setItem("sync-queue-browser-fixture", JSON.stringify(fixture.items));
      update([...fixture.items]);
    },
  };
}

export function StoreFixture({ children }: { children: ReactNode }) {
  const [items, update] = useState(fixture.items);
  return <Context.Provider value={makeStore(update)}>{children}</Context.Provider>;
}
export function useStore() {
  const store = useContext(Context);
  if (!store) throw new Error("Missing isolated store");
  return store;
}
export const PageTitle = ({ title }: { title: string }) => <h1>{title}</h1>;
