CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, department)
  VALUES (NEW.id, coalesce(NEW.raw_user_meta_data->>'full_name', split_part(coalesce(NEW.email, ''), '@', 1), ''), 'Engineering')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;