-- ============================================================
-- Row Level Security (RLS) Configuration
-- ============================================================
-- This script enables RLS on all tables and creates policies
-- to ensure users can only access their own data
-- ============================================================

-- ============================================================
-- 1. Enable RLS on all tables
-- ============================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. Users Table Policies
-- ============================================================
-- Users can only read/update their own user record

-- Policy: Users can read their own record
CREATE POLICY "Users can read own profile"
  ON users
  FOR SELECT
  USING (auth.uid() = id);

-- Policy: Users can update their own record
CREATE POLICY "Users can update own profile"
  ON users
  FOR UPDATE
  USING (auth.uid() = id);

-- Policy: Users can insert their own user record (for signup)
-- This allows frontend signup to create user record after auth signup
CREATE POLICY "Users can insert own user record"
  ON users
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Note: Backend can also insert users using service role key
-- Frontend should NOT have service role key

-- ============================================================
-- 3. Wallets Table Policies
-- ============================================================
-- Users can only access their own wallet

-- Policy: Users can read their own wallet
CREATE POLICY "Users can read own wallet"
  ON wallets
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can update their own wallet
CREATE POLICY "Users can update own wallet"
  ON wallets
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own wallet
CREATE POLICY "Users can insert own wallet"
  ON wallets
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Note: Service role can also insert wallets (for signup via backend)

-- ============================================================
-- 4. Phone Numbers Table Policies
-- ============================================================
-- Users can only access their own phone numbers

-- Policy: Users can read their own phone numbers
CREATE POLICY "Users can read own phone numbers"
  ON phone_numbers
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own phone numbers
CREATE POLICY "Users can insert own phone numbers"
  ON phone_numbers
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own phone numbers
CREATE POLICY "Users can update own phone numbers"
  ON phone_numbers
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can delete their own phone numbers
CREATE POLICY "Users can delete own phone numbers"
  ON phone_numbers
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 5. Calls Table Policies
-- ============================================================
-- Users can only access their own call records

-- Policy: Users can read their own calls
CREATE POLICY "Users can read own calls"
  ON calls
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own calls
CREATE POLICY "Users can insert own calls"
  ON calls
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own calls
CREATE POLICY "Users can update own calls"
  ON calls
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can delete their own calls
CREATE POLICY "Users can delete own calls"
  ON calls
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 6. Messages Table Policies
-- ============================================================
-- Users can only access their own messages

-- Policy: Users can read their own messages
CREATE POLICY "Users can read own messages"
  ON messages
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own messages
CREATE POLICY "Users can insert own messages"
  ON messages
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own messages
CREATE POLICY "Users can update own messages"
  ON messages
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can delete their own messages
CREATE POLICY "Users can delete own messages"
  ON messages
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 7. Verify RLS is enabled (run this to check)
-- ============================================================
-- SELECT 
--   schemaname,
--   tablename,
--   rowsecurity as rls_enabled
-- FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN ('users', 'wallets', 'phone_numbers', 'calls', 'messages')
-- ORDER BY tablename;

