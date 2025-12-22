# Ensure User and Wallet Setup

**Purpose:** Idempotent functions to ensure user and wallet records exist on login (email or Google OAuth).

---

## 🎯 Overview

When a user logs in via Supabase (email or Google), these functions ensure:
1. A user record exists in `public.users` with `id = auth.uid()`
2. A wallet record exists in `public.wallets` with `user_id = auth.uid()`

**Key Features:**
- ✅ Idempotent (safe to call multiple times)
- ✅ Works for email and Google OAuth
- ✅ Runs automatically on login
- ✅ Handles page refresh
- ✅ No UI changes

---

## 📋 Implementation

### 1. SQL Functions

**File:** `supabase/sql/011_ensure_user_wallet.sql`

**Functions Created:**

#### `ensure_user_exists(p_user_id, p_email, p_provider)`
- Creates user record if missing
- Updates email/provider if record exists
- Uses `ON CONFLICT DO UPDATE` for idempotency
- Stores provider: "google" or "email"

#### `ensure_wallet_exists(p_user_id)`
- Creates wallet record if missing
- Does nothing if wallet exists
- Sets balance to 0
- Uses `IF NOT EXISTS` check for idempotency

---

### 2. Database Schema Changes

**Provider Column Added:**
- Column: `provider TEXT` in `public.users` table
- Values: "email" or "google"
- Tracks authentication method

---

### 3. Frontend Integration

**File:** `frontend/src/context/AuthContext.jsx`

**Changes:**
- Added `getProvider()` helper function
- Added `ensureUserAndWallet()` helper function
- Called on initial session load (page refresh)
- Called on auth state change (login/OAuth)

**When It Runs:**
1. On page load/refresh (if user is authenticated)
2. On login (email or Google)
3. On OAuth callback
4. On token refresh

---

## 🔄 Flow Diagram

```
User Logs In (Email or Google)
    ↓
Supabase Auth creates/updates session
    ↓
AuthContext detects session
    ↓
getProvider() determines: "email" or "google"
    ↓
ensure_user_exists() called
    ↓
If user doesn't exist:
  - Create user record
  - id = auth.uid()
  - email = from session
  - provider = "email" or "google"
If user exists:
  - Update email/provider if needed
    ↓
ensure_wallet_exists() called
    ↓
If wallet doesn't exist:
  - Create wallet record
  - user_id = auth.uid()
  - balance = 0
If wallet exists:
  - Do nothing
    ↓
✅ User and wallet guaranteed to exist
```

---

## 🚀 Setup Instructions

### Step 1: Run SQL Script

1. Go to **Supabase Dashboard**
2. Navigate to **SQL Editor**
3. Copy and paste contents of `supabase/sql/011_ensure_user_wallet.sql`
4. Click **Run**

Or use Supabase CLI:

```bash
supabase db execute -f supabase/sql/011_ensure_user_wallet.sql
```

### Step 2: Verify Functions Created

Run this query in Supabase SQL Editor:

```sql
SELECT 
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('ensure_user_exists', 'ensure_wallet_exists');
```

**Expected Result:**
```
routine_name          | routine_type
----------------------|-------------
ensure_user_exists   | FUNCTION
ensure_wallet_exists | FUNCTION
```

### Step 3: Verify Provider Column

Run this query:

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'users' 
  AND column_name = 'provider';
```

**Expected Result:**
```
column_name | data_type
------------|----------
provider    | text
```

---

## 🧪 Testing

### Test Email Login

1. **Login with email/password**
2. **Check user record:**
```sql
SELECT id, email, provider FROM public.users WHERE id = 'your-user-id';
```
**Expected:** `provider = 'email'`

3. **Check wallet:**
```sql
SELECT user_id, balance FROM public.wallets WHERE user_id = 'your-user-id';
```
**Expected:** Wallet exists with `balance = 0`

---

### Test Google OAuth Login

1. **Login with Google**
2. **Check user record:**
```sql
SELECT id, email, provider FROM public.users WHERE id = 'your-user-id';
```
**Expected:** `provider = 'google'`

3. **Check wallet:**
```sql
SELECT user_id, balance FROM public.wallets WHERE user_id = 'your-user-id';
```
**Expected:** Wallet exists with `balance = 0`

---

### Test Idempotency

1. **Login with email**
2. **Refresh page (F5)**
3. **Functions called again**
4. **No errors, no duplicates**
5. **User and wallet still exist correctly**

---

## 🔐 Security

### RLS Considerations

The functions use `SECURITY DEFINER`, which means they run with elevated privileges. This is necessary because:

- Functions need to insert/update in `public.users` and `public.wallets`
- RLS policies might block regular users
- Functions are called from authenticated context

### Permissions

Functions are granted to `authenticated` role:
```sql
GRANT EXECUTE ON FUNCTION public.ensure_user_exists(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_wallet_exists(UUID) TO authenticated;
```

---

## 📊 Function Details

### `ensure_user_exists`

**Parameters:**
- `p_user_id UUID` - User ID from `auth.uid()`
- `p_email TEXT` - Email from auth session
- `p_provider TEXT` - "email" or "google" (default: "email")

**Behavior:**
- If user doesn't exist → Creates new user record
- If user exists → Updates email/provider if provided
- Idempotent → Safe to call multiple times

**Example:**
```sql
SELECT ensure_user_exists(
  '123e4567-e89b-12d3-a456-426614174000'::UUID,
  'user@example.com',
  'google'
);
```

---

### `ensure_wallet_exists`

**Parameters:**
- `p_user_id UUID` - User ID from `auth.uid()`

**Behavior:**
- If wallet doesn't exist → Creates new wallet with balance = 0
- If wallet exists → Does nothing
- Idempotent → Safe to call multiple times

**Example:**
```sql
SELECT ensure_wallet_exists(
  '123e4567-e89b-12d3-a456-426614174000'::UUID
);
```

---

## 🔧 Troubleshooting

### Issue: Function not found

**Error:** `function ensure_user_exists does not exist`

**Fix:**
1. Run `supabase/sql/011_ensure_user_wallet.sql` again
2. Verify functions exist with query above
3. Check function permissions

---

### Issue: Permission denied

**Error:** `permission denied for function ensure_user_exists`

**Fix:**
```sql
GRANT EXECUTE ON FUNCTION public.ensure_user_exists(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_wallet_exists(UUID) TO authenticated;
```

---

### Issue: Provider column missing

**Error:** `column "provider" does not exist`

**Fix:**
Run the SQL script again - it includes a check to add the column if missing.

---

### Issue: User not created

**Check:**
1. RLS policies allow function execution
2. Function has SECURITY DEFINER
3. User is authenticated
4. Check browser console for errors

**Fix:**
- Verify RLS policies allow inserts
- Check function permissions
- Review Supabase logs

---

## ✅ Benefits

1. **Idempotent:** Safe to call multiple times
2. **Automatic:** Runs on every login
3. **Reliable:** Ensures data consistency
4. **Flexible:** Works for email and OAuth
5. **No UI Changes:** Transparent to user

---

## 📚 Related Files

- `supabase/sql/011_ensure_user_wallet.sql` - SQL functions
- `frontend/src/context/AuthContext.jsx` - Frontend integration
- `supabase/sql/009_auth_users_trigger.sql` - Auth trigger (signup)
- `supabase/sql/010_users_wallet_trigger.sql` - Wallet trigger (signup)

---

## 🎯 Summary

**Status:** ✅ Complete

**What It Does:**
- Ensures user record exists on login (email or Google)
- Ensures wallet record exists on login
- Stores provider ("email" or "google")
- Idempotent (safe to run multiple times)

**When It Runs:**
- On page load/refresh (if authenticated)
- On login (email or Google)
- On OAuth callback
- On token refresh

**Next Step:** Run `supabase/sql/011_ensure_user_wallet.sql` in Supabase SQL Editor.

---

**Last Updated:** 2025-12-17  
**Status:** ✅ Ready to Deploy

