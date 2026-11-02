import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  ClientOnly,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import { registerOfflineApp } from "@/lib/pwa";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";
import { ConfirmHost } from "@/components/ConfirmHost";
import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Ledgerline — Personal finance" },
      { name: "description", content: "Private accounts, family spending, budgets and financial planning." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@Lovable" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700&family=Noto+Sans+Tamil:wght@400;600&display=swap" },
      // Open the secure link to the record store while the page is still loading, so the first fetch doesn't wait on it.
      { rel: "preconnect", href: (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "") },
      { rel: "dns-prefetch", href: (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "") },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
    scripts: [
      {
        /* Apply the saved theme before first paint to avoid a flash. */
        children: `try{var t=JSON.parse(localStorage.getItem("ll-theme")||"{}");var e=document.documentElement;e.dataset.theme=t.themeName||"signature";e.classList.toggle("dark",t.appearance==="dark"||(t.appearance!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches));}catch(_){}`,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function AuthListener() {
  useEffect(()=>{void registerOfflineApp().catch(()=>{});},[]);
  const router = useRouter();
  const { queryClient } = Route.useRouteContext();
  useEffect(() => {
    let current: string | null | undefined;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const id = session?.user?.id ?? null;
      if (event === "INITIAL_SESSION") { current = id; return; }
      // Supabase repeats SIGNED_IN for the already-restored user on start-up/tab focus; skip that reload.
      if (event === "SIGNED_IN" && id === current) return;
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      current = id;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <AuthListener />
      <ClientOnly fallback={<p className="p-6 text-muted-foreground">Loading Ledgerline…</p>}><Outlet /></ClientOnly>
      <Toaster />
      <ConfirmHost />
    </QueryClientProvider>
  );
}
