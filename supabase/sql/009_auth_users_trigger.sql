-- ============================================================
-- Auth Users Trigger
-- ============================================================
-- Automatically creates a public.users record when a user
-- signs up via Supabase Auth
-- ============================================================

-- ============================================================
-- 1. Create Trigger Function
-- ============================================================
-- This function runs after a user is inserted into auth.users
-- and creates a corresponding record in public.users
-- Uses auth.uid() (NEW.id) as the user ID

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, password_hash, name, created_at)
  VALUES (
    NEW.id,                    -- Use auth.uid() (from auth.users.id)
    NEW.email,                 -- Email from auth.users
    '',                        -- Placeholder (not needed with Supabase Auth)
    COALESCE(NEW.raw_user_meta_data->>'name', NULL), -- Name from metadata if available
    NOW()                      -- Current timestamp
  )
  ON CONFLICT (id) DO NOTHING; -- Safely ignore duplicates (by primary key)
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 2. Create Trigger
-- ============================================================
-- Trigger fires AFTER a new user is inserted into auth.users

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 3. Grant Necessary Permissions
-- ============================================================
-- Ensure the function can insert into public.users

GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated;
GRANT INSERT ON public.users TO postgres, anon, authenticated;

-- ============================================================
-- Notes:
-- ============================================================
-- - Trigger runs automatically when user signs up via Supabase Auth
-- - Uses auth.uid() (NEW.id) as the user ID
-- - Stores email from auth.users.email
-- - Safely ignores duplicates with ON CONFLICT DO NOTHING
-- - password_hash is set to empty string (not needed with Supabase Auth)
-- - Name is extracted from user metadata if available
-- - Does NOT modify existing tables

