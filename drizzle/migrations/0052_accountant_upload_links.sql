CREATE TABLE public.accountant_contacts (
  owner_id uuid PRIMARY KEY,
  name text NOT NULL DEFAULT 'Mr. Durai',
  email text NOT NULL DEFAULT '',
  send_day int NOT NULL DEFAULT 1 CHECK (send_day BETWEEN 1 AND 28),
  auto_send boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accountant_contacts TO authenticated;
GRANT ALL ON public.accountant_contacts TO service_role;
ALTER TABLE public.accountant_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own accountant" ON public.accountant_contacts FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE TABLE public.upload_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days',
  revoked_at timestamptz,
  file_count int NOT NULL DEFAULT 0,
  max_files int NOT NULL DEFAULT 50,
  last_emailed_at timestamptz
);
CREATE INDEX upload_links_owner ON public.upload_links(owner_id, created_at DESC);
GRANT SELECT, UPDATE ON public.upload_links TO authenticated;
GRANT ALL ON public.upload_links TO service_role;
ALTER TABLE public.upload_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own links read" ON public.upload_links FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "own links revoke" ON public.upload_links FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE TABLE public.accountant_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  link_id uuid NOT NULL REFERENCES public.upload_links(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_name text NOT NULL,
  size_bytes int NOT NULL,
  mime_type text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz
);
CREATE INDEX accountant_uploads_owner ON public.accountant_uploads(owner_id, consumed_at);
GRANT SELECT, UPDATE, DELETE ON public.accountant_uploads TO authenticated;
GRANT ALL ON public.accountant_uploads TO service_role;
ALTER TABLE public.accountant_uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own uploads read" ON public.accountant_uploads FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "own uploads mark" ON public.accountant_uploads FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "own uploads delete" ON public.accountant_uploads FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- Atomically reserves one file slot on an active link; service role only.
CREATE OR REPLACE FUNCTION public.claim_upload_slot(_link uuid)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.upload_links SET file_count = file_count + 1
  WHERE id = _link AND revoked_at IS NULL AND expires_at > now() AND file_count < max_files
  RETURNING owner_id
$$;
REVOKE ALL ON FUNCTION public.claim_upload_slot(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_upload_slot(uuid) TO service_role;

CREATE POLICY "owner reads accountant uploads" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'statement-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "owner deletes accountant uploads" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'statement-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);