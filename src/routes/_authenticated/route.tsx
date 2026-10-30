import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { StoreProvider } from "@/lib/store";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    return { userId: data.user.id };
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
