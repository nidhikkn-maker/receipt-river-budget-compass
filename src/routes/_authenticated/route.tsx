import { createFileRoute, Outlet } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { StoreProvider } from "@/lib/store";
import { AppShell } from "@/components/AppShell";

// No sign-in screen: a private, invisible session is created on first visit.
// Data stays private to this browser's session (RLS scopes every row to it).
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) return { userId: data.user.id };
    const { data: anon, error } = await supabase.auth.signInAnonymously();
    if (error || !anon.user) throw new Error("Couldn't start your session. Please refresh.");
    return { userId: anon.user.id };
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
