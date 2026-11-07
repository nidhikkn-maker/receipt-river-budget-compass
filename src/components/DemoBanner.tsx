import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/** Shown only to visitor demo sessions. */
export function DemoBanner() {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const u = data.session?.user;
      if (!u?.is_anonymous) return;
      const { data: row } = await supabase.from("demo_sessions").select("label").eq("owner_id", u.id).maybeSingle();
      if (on && row) setLabel(row.label);
    })();
    return () => { on = false; };
  }, []);
  if (!label) return null;
  return <div role="status" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-accent px-4 py-1.5 text-center text-xs text-accent-foreground">
    <span className="font-medium">Demo — {label}</span>
    <span className="text-accent-foreground/80">Sample data, removed after 24 hours.</span>
    <Link to="/auth" className="font-semibold underline underline-offset-2">Create your own account</Link>
  </div>;
}
