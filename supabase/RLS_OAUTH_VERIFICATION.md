# RLS OAuth Verification Guide

**Purpose:** Verify RLS policies work correctly for Google OAuth users and prevent duplicate user creation.

---

## 🎯 Overview

This guide ensures:
1. ✅ RLS policies use `auth.uid()` everywhere
2. ✅ Google OAuth users can read/write their own data
3. ✅ No cross-user access is possible
4. ✅ No duplicate users or wallets
5. ✅ Edge case handled: email signup → Google login

---

## 📋 Verification Steps

### Step 1: Run Verification Script

**File:** `supabase/sql/012_verify_rls_oauth.sql`

Run in Supabase SQL Editor to verify:
- RLS is enabled on all tables
- All policies use `auth.uid()`
- Wallet INSERT policy exists

---

### Step 2: Run Duplicate Prevention Script

**File:** `supabase/sql/013_prevent_duplicate_users.sql`

Run in Supabase SQL Editor to:
- Add wallet INSERT policy (if missing)
- Update `ensure_user_exists` to handle email conflicts
- Ensure email unique constraint exists

---

## 🔐 RLS Policy Verification

### All Tables Must Use `auth.uid()`

**Users Table:**
- ✅ SELECT: `auth.uid() = id`
- ✅ UPDATE: `auth.uid() = id`
- ✅ INSERT: `auth.uid() = id`

**Wallets Table:**
- ✅ SELECT: `auth.uid() = user_id`
- ✅ UPDATE: `auth.uid() = user_id`
- ✅ INSERT: `auth.uid() = user_id` (NEW)

**Phone Numbers Table:**
- ✅ SELECT: `auth.uid() = user_id`
- ✅ INSERT: `auth.uid() = user_id`
- ✅ UPDATE: `auth.uid() = user_id`
- ✅ DELETE: `auth.uid() = user_id`

**Calls Table:**
- ✅ SELECT: `auth.uid() = user_id`
- ✅ INSERT: `auth.uid() = user_id`
- ✅ UPDATE: `auth.uid() = user_id`
- ✅ DELETE: `auth.uid() = user_id`

**Messages Table:**
- ✅ SELECT: `auth.uid() = user_id`
- ✅ INSERT: `auth.uid() = user_id`
- ✅ UPDATE: `auth.uid() = user_id`
- ✅ DELETE: `auth.uid() = user_id`

---

## 🧪 Testing Scenarios

### Test 1: Google OAuth User Can Access Own Wallet

```sql
-- As Google OAuth user (auth.uid() = 'google-user-id')
SELECT * FROM wallets WHERE user_id = auth.uid();
-- ✅ Should return user's wallet

SELECT * FROM wallets WHERE user_id != auth.uid();
-- ❌ Should return empty (RLS blocks)
```

---

### Test 2: Google OAuth User Can Access Own Phone Numbers

```sql
-- As Google OAuth user
SELECT * FROM phone_numbers WHERE user_id = auth.uid();
-- ✅ Should return user's phone numbers

SELECT * FROM phone_numbers WHERE user_id != auth.uid();
-- ❌ Should return empty (RLS blocks)
```

---

### Test 3: Google OAuth User Can Access Own Calls

```sql
-- As Google OAuth user
SELECT * FROM calls WHERE user_id = auth.uid();
-- ✅ Should return user's calls

SELECT * FROM calls WHERE user_id != auth.uid();
-- ❌ Should return empty (RLS blocks)
```

---

### Test 4: Google OAuth User Can Access Own Messages

```sql
-- As Google OAuth user
SELECT * FROM messages WHERE user_id = auth.uid();
-- ✅ Should return user's messages

SELECT * FROM messages WHERE user_id != auth.uid();
-- ❌ Should return empty (RLS blocks)
```

---

### Test 5: Prevent Duplicate Users

**Scenario:** Email signup → Google login (same email)

1. **User signs up with email:**
   - `auth.uid()` = `user-id-1`
   - `public.users` has record with `id = user-id-1`, `email = user@example.com`

2. **User logs in with Google (same email):**
   - Supabase Auth may create `user-id-2` OR link to `user-id-1`
   - If linked: `auth.uid()` = `user-id-1` (same as before)
   - If not linked: `auth.uid()` = `user-id-2` (different)

3. **Our function handles both cases:**
   - If `user-id-1`: Updates existing record
   - If `user-id-2`: Email unique constraint prevents duplicate
   - Function updates existing record if email matches

---

### Test 6: Prevent Duplicate Wallets

```sql
-- Try to create duplicate wallet
INSERT INTO wallets (user_id, balance) 
VALUES (auth.uid(), 0);
-- ✅ Should succeed (first time)

-- Try again
INSERT INTO wallets (user_id, balance) 
VALUES (auth.uid(), 0);
-- ❌ Should fail (duplicate user_id) OR be ignored by ensure_wallet_exists
```

---

## 🔧 Implementation Details

### Updated `ensure_user_exists` Function

**Handles:**
1. **New user:** Creates user record with `auth.uid()`
2. **Existing user (same user_id):** Updates email/provider
3. **Email conflict (different user_id):** Updates existing record
4. **Wallet:** Automatically ensures wallet exists

**Key Features:**
- Uses `ON CONFLICT (id)` for user_id conflicts
- Uses `ON CONFLICT (email)` for email conflicts
- Provider stored as comma-separated if multiple methods
- Idempotent (safe to call multiple times)

---

### Wallet INSERT Policy

**Added to:** `supabase/sql/007_enable_rls.sql`

```sql
CREATE POLICY "Users can insert own wallet"
  ON wallets
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

**Why needed:**
- Google OAuth users need to create their own wallets
- `ensure_wallet_exists` function uses this policy
- Works for both email and OAuth users

---

## ✅ Verification Checklist

### RLS Policies
- [ ] RLS enabled on all 5 tables
- [ ] All policies use `auth.uid()`
- [ ] Wallet INSERT policy exists
- [ ] No anonymous access allowed

### Google OAuth Users
- [ ] Can read own wallet
- [ ] Can update own wallet
- [ ] Can insert own wallet
- [ ] Can read own phone numbers
- [ ] Can insert own phone numbers
- [ ] Can read own calls
- [ ] Can insert own calls
- [ ] Can read own messages
- [ ] Can insert own messages
- [ ] Cannot access other users' data

### Duplicate Prevention
- [ ] No duplicate users (same user_id)
- [ ] No duplicate wallets (same user_id)
- [ ] Email unique constraint enforced
- [ ] Edge case handled: email signup → Google login

---

## 🚨 Common Issues

### Issue: Google user can't access wallet

**Check:**
1. Wallet INSERT policy exists
2. RLS enabled on wallets table
3. Policy uses `auth.uid() = user_id`

**Fix:**
- Run `supabase/sql/007_enable_rls.sql` again
- Verify wallet INSERT policy exists

---

### Issue: Duplicate users created

**Check:**
1. Email unique constraint exists
2. `ensure_user_exists` handles email conflicts
3. Supabase email linking enabled

**Fix:**
- Run `supabase/sql/013_prevent_duplicate_users.sql`
- Enable email linking in Supabase Auth settings

---

### Issue: Cross-user access

**Check:**
1. All policies use `auth.uid()`
2. No policies allow `user_id != auth.uid()`
3. RLS enabled on all tables

**Fix:**
- Run `supabase/sql/012_verify_rls_oauth.sql` to check
- Review all policies use `auth.uid()`

---

## 📚 Related Files

- `supabase/sql/007_enable_rls.sql` - RLS policies
- `supabase/sql/012_verify_rls_oauth.sql` - Verification script
- `supabase/sql/013_prevent_duplicate_users.sql` - Duplicate prevention
- `supabase/sql/011_ensure_user_wallet.sql` - User/wallet functions

---

## 🎯 Summary

**Status:** ✅ Ready for Verification

**What to Do:**
1. Run `supabase/sql/012_verify_rls_oauth.sql` - Verify RLS
2. Run `supabase/sql/013_prevent_duplicate_users.sql` - Prevent duplicates
3. Test Google OAuth user access
4. Verify no cross-user access

**Key Points:**
- All RLS policies use `auth.uid()`
- Google OAuth users have same access as email users
- Duplicate prevention handles edge cases
- No security weakened

---

**Last Updated:** 2025-12-17  
**Status:** ✅ Ready to Deploy

