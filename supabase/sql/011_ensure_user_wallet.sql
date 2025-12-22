-- ============================================================
-- Ensure User and Wallet Functions
-- ============================================================
-- Idempotent functions to ensure user and wallet records exist
-- Called on login (email or Google) to handle cases where
-- user exists in auth.users but not in public.users
-- ============================================================

-- ============================================================
-- 1. Add provider column to users table (if not exists)
-- ============================================================
-- This column stores the authentication provider: "email" or "google"

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'users' 
    AND column_name = 'provider'
  ) THEN
    ALTER TABLE public.users ADD COLUMN provider TEXT;
  END IF;
END $$;

-- ============================================================
-- 2. Create Function: Ensure User Exists
-- ============================================================
-- Idempotent function that creates a user record if it doesn't exist
-- Can be called multiple times safely

CREATE OR REPLACE FUNCTION public.ensure_user_exists(
  p_user_id UUID,
  p_email TEXT,
  p_provider TEXT DEFAULT 'email'
)
RETURNS void AS $$
BEGIN
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
    provider = COALESCE(EXCLUDED.provider, public.users.provider);
    -- Only update if new values are provided, otherwise keep existing
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 3. Create Function: Ensure Wallet Exists
-- ============================================================
-- Idempotent function that creates a wallet record if it doesn't exist
-- Can be called multiple times safely

CREATE OR REPLACE FUNCTION public.ensure_wallet_exists(
  p_user_id UUID
)
RETURNS void AS $$
BEGIN
  -- Check if wallet already exists
  IF NOT EXISTS (SELECT 1 FROM public.wallets WHERE user_id = p_user_id) THEN
    INSERT INTO public.wallets (user_id, balance, updated_at)
    VALUES (
      p_user_id,            -- Use auth.uid()
      0,                    -- Set balance to 0
      NOW()                 -- Current timestamp
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 4. Grant Permissions
-- ============================================================
-- Allow authenticated users to call these functions

GRANT EXECUTE ON FUNCTION public.ensure_user_exists(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_wallet_exists(UUID) TO authenticated;

-- ============================================================
-- Notes:
-- ============================================================
-- - ensure_user_exists: Creates user record if missing, updates if exists
-- - ensure_wallet_exists: Creates wallet record if missing, does nothing if exists
-- - Both functions are idempotent (safe to call multiple times)
-- - Provider column added to track authentication method
-- - Functions use SECURITY DEFINER to bypass RLS if needed

