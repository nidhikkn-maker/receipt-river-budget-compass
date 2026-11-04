import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { StoreProvider } from "@/lib/store";
import { AppShell } from "@/components/AppShell";
import { localSessionUserId } from "@/lib/local-session";

// Preserve existing browser identities so email account upgrades retain their rows.
// New visitors sign in; offline access uses only this device's existing session.
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Local session check keeps page opens instant; every data request is still verified by the server.
    const userId = await localSessionUserId();
    if (userId) {
      if (navigator.onLine) void supabase.auth.getUser().then(({ data: u, error }) => { if (!u.user && error?.status === 401) void supabase.auth.signOut({ scope: "local" }); });
      return { userId };
    }
    throw redirect({ to: "/auth" });
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const { userId } = Route.useRouteContext();
  return (
    <StoreProvider userId={userId}>
      <AppShell>
        <Outlet />
      </AppShell>
    </StoreProvider>
  );
}
