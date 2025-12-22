-- ============================================================
-- Verify RLS Policies for OAuth Users
-- ============================================================
-- This script verifies that RLS policies work correctly for
-- Google OAuth users and prevents duplicate user creation
-- ============================================================

-- ============================================================
-- 1. Verify RLS is enabled on all tables
-- ============================================================

SELECT 
  tablename,
  rowsecurity as rls_enabled,
  CASE 
    WHEN rowsecurity THEN '✅ ENABLED'
    ELSE '❌ DISABLED - RUN 007_enable_rls.sql'
  END as status
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('users', 'wallets', 'phone_numbers', 'calls', 'messages')
ORDER BY tablename;

-- ============================================================
-- 2. Verify all policies use auth.uid()
-- ============================================================

SELECT 
  tablename,
  policyname,
  cmd as command,
  CASE 
    WHEN qual::text LIKE '%auth.uid()%' OR with_check::text LIKE '%auth.uid()%' THEN '✅ USES auth.uid()'
    ELSE '❌ MISSING auth.uid()'
  END as auth_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('users', 'wallets', 'phone_numbers', 'calls', 'messages')
ORDER BY tablename, policyname;

-- ============================================================
-- 3. Verify wallet INSERT policy exists
-- ============================================================

SELECT 
  tablename,
  policyname,
  cmd as command
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'wallets'
  AND cmd = 'INSERT';

-- If no result, add wallet INSERT policy below

