-- ============================================================
-- Users Wallet Trigger
-- ============================================================
-- Automatically creates a wallet record when a user is
-- inserted into public.users
-- ============================================================

-- ============================================================
-- 1. Create Trigger Function
-- ============================================================
-- This function runs after a user is inserted into public.users
-- and creates a corresponding wallet record with balance = 0

CREATE OR REPLACE FUNCTION public.handle_new_user_wallet()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if wallet already exists for this user
  IF NOT EXISTS (SELECT 1 FROM public.wallets WHERE user_id = NEW.id) THEN
    INSERT INTO public.wallets (user_id, balance, updated_at)
    VALUES (
      NEW.id,                    -- Use user_id from the new user record
      0,                         -- Set balance to 0
      NOW()                      -- Set updated_at to current timestamp
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 2. Create Trigger
-- ============================================================
-- Trigger fires AFTER a new user is inserted into public.users

CREATE TRIGGER on_user_created_wallet
  AFTER INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_wallet();

-- ============================================================
-- 3. Grant Necessary Permissions
-- ============================================================
-- Ensure the function can insert into public.wallets

GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated;
GRANT INSERT ON public.wallets TO postgres, anon, authenticated;

-- ============================================================
-- Notes:
-- ============================================================
-- - Trigger runs automatically when a user is inserted into public.users
-- - Uses NEW.id as the user_id for the wallet
-- - Sets balance to 0 explicitly
-- - Safely ignores duplicates by checking if wallet exists first
-- - Does NOT modify existing tables

