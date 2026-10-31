import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { StoreProvider } from "@/lib/store";
import { AppShell } from "@/components/AppShell";

// Preserve existing browser identities so email account upgrades retain their rows.
// New visitors sign in; offline access uses only this device's existing session.
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    if (!navigator.onLine) {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) return { userId: data.session.user.id };
      throw redirect({ to: "/auth" });
    }
    const { data } = await supabase.auth.getUser();
    if (data.user) return { userId: data.user.id };
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
