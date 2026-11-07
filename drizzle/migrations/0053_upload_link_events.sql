CREATE TABLE public.upload_link_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  link_id uuid NOT NULL REFERENCES public.upload_links(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('created','emailed','opened','uploaded','turned_off')),
  detail text,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX upload_link_events_owner ON public.upload_link_events(owner_id, at DESC);
GRANT SELECT, INSERT ON public.upload_link_events TO authenticated;
GRANT ALL ON public.upload_link_events TO service_role;
ALTER TABLE public.upload_link_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own link events read" ON public.upload_link_events FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "own link events add" ON public.upload_link_events FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid() AND kind = 'turned_off');