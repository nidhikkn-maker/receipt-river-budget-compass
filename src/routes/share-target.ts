import { createFileRoute } from "@tanstack/react-router";

// Normally the installed app's offline helper answers shares on the phone itself. If it isn't ready yet,
// the share reaches here: nothing is stored, the owner is sent to a page explaining how to retry.
export const Route = createFileRoute("/share-target")({
  server: {
    handlers: {
      POST: async () => new Response(null, { status: 303, headers: { Location: "/shared?error=not-ready" } }),
      GET: async () => new Response(null, { status: 303, headers: { Location: "/shared" } }),
    },
  },
});
