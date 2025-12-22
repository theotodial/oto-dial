-- ============================================================
-- Prevent Duplicate User Creation
-- ============================================================
-- Handles edge case: email signup then Google login with same email
-- Ensures same email maps to same user_id
-- ============================================================

-- ============================================================
-- 1. Update ensure_user_exists to prevent duplicates
-- ============================================================
-- If a user with the same email exists, use that user_id instead
-- This handles: email signup → Google login with same email

CREATE OR REPLACE FUNCTION public.ensure_user_exists(
  p_user_id UUID,
  p_email TEXT,
  p_provider TEXT DEFAULT 'email'
)
RETURNS void AS $$
DECLARE
  existing_user_id UUID;
BEGIN
  -- Check if a user with this email already exists (different user_id)
  -- This handles edge case: email signup → Google login with same email
  -- Note: Supabase Auth should link accounts if email linking is enabled
  -- But we handle the case where it doesn't
  SELECT id INTO existing_user_id
  FROM public.users
  WHERE email = p_email
    AND id != p_user_id  -- Different user_id
  LIMIT 1;
  
  -- If email exists with different user_id, update that record instead
  -- This prevents duplicate users with same email
  IF existing_user_id IS NOT NULL THEN
    -- Update existing user record (email signup → Google login)
    UPDATE public.users
    SET 
      provider = CASE 
        WHEN provider IS NULL THEN p_provider
        WHEN provider = p_provider THEN provider
        WHEN provider NOT LIKE '%' || p_provider || '%' 
          THEN provider || ',' || p_provider
        ELSE provider
      END
    WHERE id = existing_user_id;
    
    -- Ensure wallet exists for existing user
    PERFORM public.ensure_wallet_exists(existing_user_id);
  ELSE
    -- No existing user with this email, create new record
    INSERT INTO public.users (id, email, password_hash, name, provider, created_at)
    VALUES (
      p_user_id,              -- Use auth.uid()
      p_email,                -- Email from auth session
      '',                     -- Placeholder (not needed with Supabase Auth)
      NULL,                   -- Name can be updated later
      p_provider,             -- "google" or "email"
      NOW()                   -- Current timestamp
    )
    ON CONFLICT (id) DO UPDATE
    SET 
      email = COALESCE(EXCLUDED.email, public.users.email),
      provider = CASE 
        WHEN public.users.provider IS NULL THEN EXCLUDED.provider
        WHEN public.users.provider = EXCLUDED.provider THEN public.users.provider
        WHEN public.users.provider NOT LIKE '%' || EXCLUDED.provider || '%' 
          THEN public.users.provider || ',' || EXCLUDED.provider
        ELSE public.users.provider
      END;
    
    -- Ensure wallet exists for new user
    PERFORM public.ensure_wallet_exists(p_user_id);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 3. Create function to get user_id by email (for linking)
-- ============================================================
-- Helper function to find existing user by email

CREATE OR REPLACE FUNCTION public.get_user_id_by_email(
  p_email TEXT
)
RETURNS UUID AS $$
DECLARE
  user_id UUID;
BEGIN
  SELECT id INTO user_id
  FROM public.users
  WHERE email = p_email
  LIMIT 1;
  
  RETURN user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 4. Add unique constraint on email (if not exists)
-- ============================================================
-- Prevents duplicate emails at database level

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'users_email_key'
  ) THEN
    -- Email unique constraint should already exist from table creation
    -- This is just a safety check
    ALTER TABLE public.users ADD CONSTRAINT users_email_key UNIQUE (email);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN
    -- Constraint already exists, ignore
    NULL;
END $$;

-- ============================================================
-- 5. Grant Permissions
-- ============================================================

GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(TEXT) TO authenticated;

-- ============================================================
-- Notes:
-- ============================================================
-- - ensure_user_exists now checks for existing email first
-- - If email exists, uses that user_id (prevents duplicates)
-- - Provider stored as comma-separated if user has multiple methods
-- - Wallet automatically created for correct user_id
-- - Email unique constraint prevents duplicates at DB level

