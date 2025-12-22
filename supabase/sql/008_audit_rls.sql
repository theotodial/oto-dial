-- ============================================================
-- RLS Audit Script
-- ============================================================
-- Run this script to verify RLS is properly configured
-- ============================================================

-- ============================================================
-- 1. Check if RLS is enabled on all tables
-- ============================================================
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled,
  CASE 
    WHEN rowsecurity THEN '✅ ENABLED'
    ELSE '❌ DISABLED'
  END as status
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('users', 'wallets', 'phone_numbers', 'calls', 'messages')
ORDER BY tablename;

-- ============================================================
-- 2. List all RLS policies for each table
-- ============================================================
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd as command,
  qual as using_expression,
  with_check as with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('users', 'wallets', 'phone_numbers', 'calls', 'messages')
ORDER BY tablename, policyname;

-- ============================================================
-- 3. Count policies per table
-- ============================================================
SELECT 
  tablename,
  COUNT(*) as policy_count,
  CASE 
    WHEN COUNT(*) = 0 THEN '❌ NO POLICIES'
    ELSE '✅ HAS POLICIES'
  END as status
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('users', 'wallets', 'phone_numbers', 'calls', 'messages')
GROUP BY tablename
ORDER BY tablename;

-- ============================================================
-- 4. Check for anonymous access (should be blocked)
-- ============================================================
-- This query checks if any policies allow anonymous access
SELECT 
  tablename,
  policyname,
  roles,
  CASE 
    WHEN 'anon' = ANY(roles) OR 'public' = ANY(roles) THEN '❌ ALLOWS ANONYMOUS'
    ELSE '✅ BLOCKS ANONYMOUS'
  END as anonymous_access
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('users', 'wallets', 'phone_numbers', 'calls', 'messages')
  AND ('anon' = ANY(roles) OR 'public' = ANY(roles))
ORDER BY tablename, policyname;

-- ============================================================
-- 5. Verify user_id = auth.uid() in policies
-- ============================================================
-- Check if policies use auth.uid() correctly
SELECT 
  tablename,
  policyname,
  cmd as command,
  CASE 
    WHEN qual::text LIKE '%auth.uid()%' OR qual::text LIKE '%auth.uid()%' THEN '✅ USES auth.uid()'
    ELSE '❌ MISSING auth.uid()'
  END as auth_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('users', 'wallets', 'phone_numbers', 'calls', 'messages')
ORDER BY tablename, policyname;

-- ============================================================
-- 6. Summary Report
-- ============================================================
WITH rls_status AS (
  SELECT 
    tablename,
    rowsecurity as rls_enabled
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN ('users', 'wallets', 'phone_numbers', 'calls', 'messages')
),
policy_count AS (
  SELECT 
    tablename,
    COUNT(*) as policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('users', 'wallets', 'phone_numbers', 'calls', 'messages')
  GROUP BY tablename
)
SELECT 
  r.tablename,
  CASE WHEN r.rls_enabled THEN '✅' ELSE '❌' END as rls_enabled,
  COALESCE(p.policy_count, 0) as policy_count,
  CASE 
    WHEN r.rls_enabled AND COALESCE(p.policy_count, 0) > 0 THEN '✅ SECURE'
    WHEN r.rls_enabled AND COALESCE(p.policy_count, 0) = 0 THEN '⚠️ RLS ENABLED BUT NO POLICIES'
    ELSE '❌ INSECURE'
  END as security_status
FROM rls_status r
LEFT JOIN policy_count p ON r.tablename = p.tablename
ORDER BY r.tablename;

