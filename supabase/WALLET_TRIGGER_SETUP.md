# Wallet Auto-Creation Trigger Setup

**Purpose:** Automatically create a wallet record when a user is inserted into `public.users`.

---

## 🎯 Overview

This trigger automatically creates a corresponding wallet record in `public.wallets` whenever a new user is created in `public.users`.

### Features

- ✅ Runs automatically after `public.users` INSERT
- ✅ Creates wallet with `user_id` matching the new user's ID
- ✅ Sets `balance` to 0
- ✅ Safely ignores duplicates
- ✅ Does NOT modify existing tables

---

## 📋 Trigger Details

### Function: `handle_new_user_wallet()`

**Trigger Event:** `AFTER INSERT` on `public.users`  
**Trigger Type:** `FOR EACH ROW`  
**Security:** `SECURITY DEFINER` (runs with elevated privileges)

### What It Does

1. **Captures New User**
   - Triggered when a user is inserted into `public.users`
   - Receives the new user record as `NEW`

2. **Creates Wallet Record**
   - Inserts into `public.wallets` table
   - Uses `NEW.id` as the `user_id`
   - Sets `balance` to 0
   - Sets `updated_at` to current timestamp
   - `id` is auto-generated (UUID)

3. **Handles Duplicates**
   - Uses `ON CONFLICT (user_id) DO NOTHING`
   - Prevents errors from duplicate inserts
   - Safely ignores if wallet already exists

---

## 🚀 Setup Instructions

### Step 1: Run the SQL Script

1. Go to **Supabase Dashboard**
2. Navigate to **SQL Editor**
3. Copy and paste the contents of `supabase/sql/010_users_wallet_trigger.sql`
4. Click **Run**

Or use Supabase CLI:

```bash
supabase db execute -f supabase/sql/010_users_wallet_trigger.sql
```

### Step 2: Verify Trigger Created

Run this query in Supabase SQL Editor:

```sql
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table = 'users'
  AND trigger_name = 'on_user_created_wallet';
```

**Expected Result:**
```
trigger_name              | event_manipulation | event_object_table | action_statement
-------------------------|-------------------|-------------------|------------------
on_user_created_wallet   | INSERT            | users             | EXECUTE FUNCTION public.handle_new_user_wallet()
```

### Step 3: Test the Trigger

1. **Insert a new user** into `public.users`
2. **Check if wallet was created:**

```sql
SELECT * FROM public.wallets 
WHERE user_id = (SELECT id FROM public.users ORDER BY created_at DESC LIMIT 1);
```

**Expected Result:** A new wallet record with `balance = 0` and matching `user_id`.

---

## 🔍 How It Works

### Flow Diagram

```
User Inserted into public.users
    ↓
Trigger fires: on_user_created_wallet
    ↓
Function executes: handle_new_user_wallet()
    ↓
Inserts into public.wallets
    ↓
ON CONFLICT handles duplicates safely
    ↓
Wallet created with balance = 0 ✅
```

### Example

**Before User Insert:**
```sql
-- public.users: (empty)
-- public.wallets: (empty)
```

**User inserted:**
```sql
INSERT INTO public.users (id, email, password_hash, name)
VALUES (
  '123e4567-e89b-12d3-a456-426614174000',
  'user@example.com',
  'hashed_password',
  'John Doe'
);
```

**After User Insert:**
```sql
-- public.users:
-- id: '123e4567-e89b-12d3-a456-426614174000'
-- email: 'user@example.com'
-- ...

-- public.wallets:
-- id: 'auto-generated-uuid'
-- user_id: '123e4567-e89b-12d3-a456-426614174000'  ← Matches user.id
-- balance: 0                                        ← Set to 0
-- updated_at: '2025-12-17 10:30:00'
```

---

## 🛡️ Security Considerations

### SECURITY DEFINER

The function uses `SECURITY DEFINER`, which means it runs with the privileges of the function owner (typically `postgres`). This is necessary because:

- The function needs to insert into `public.wallets`
- Regular users don't have direct INSERT permissions on `public.wallets` (RLS protected)
- The trigger runs in the `public` schema context

### Duplicate Handling

The trigger safely handles duplicates using:

```sql
ON CONFLICT (user_id) DO NOTHING
```

This prevents errors if:
- The trigger runs multiple times
- A wallet record already exists
- There's a race condition

**Note:** This assumes `user_id` has a UNIQUE constraint. If not, you may need to add one:

```sql
ALTER TABLE wallets ADD CONSTRAINT wallets_user_id_unique UNIQUE (user_id);
```

---

## 🔧 Troubleshooting

### Issue: Trigger not firing

**Check if trigger exists:**
```sql
SELECT * FROM information_schema.triggers 
WHERE trigger_name = 'on_user_created_wallet';
```

**If missing, re-run the setup script.**

---

### Issue: Wallet not created

**Check function exists:**
```sql
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_name = 'handle_new_user_wallet';
```

**Check for errors:**
```sql
SELECT * FROM pg_stat_user_functions 
WHERE funcname = 'handle_new_user_wallet';
```

**Check RLS policies:**
```sql
SELECT * FROM pg_policies 
WHERE tablename = 'wallets';
```

The trigger function uses `SECURITY DEFINER`, so it should bypass RLS. If wallets table has RLS enabled, ensure the function has proper permissions.

---

### Issue: Duplicate key error

**This should not happen** with `ON CONFLICT DO NOTHING`, but if it does:

1. Check if `user_id` has a UNIQUE constraint
2. Verify conflict handler is present
3. Check for concurrent inserts

**Add unique constraint if missing:**
```sql
ALTER TABLE wallets ADD CONSTRAINT wallets_user_id_unique UNIQUE (user_id);
```

---

### Issue: Permission denied

**Grant necessary permissions:**
```sql
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated;
GRANT INSERT ON public.wallets TO postgres, anon, authenticated;
```

---

## 📊 Verification Queries

### Check Trigger Status

```sql
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table = 'users'
  AND trigger_name = 'on_user_created_wallet';
```

### Check Function

```sql
SELECT 
  routine_name,
  routine_type,
  security_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'handle_new_user_wallet';
```

### Test Duplicate Handling

```sql
-- Insert a user
INSERT INTO public.users (id, email, password_hash)
VALUES (
  gen_random_uuid(),
  'test@example.com',
  'hashed_password'
);

-- Try to insert again (should not error - duplicate ignored)
-- The trigger will try to create wallet again, but ON CONFLICT will ignore it
```

### Verify Wallet Created

```sql
-- Get the latest user
WITH latest_user AS (
  SELECT id FROM public.users ORDER BY created_at DESC LIMIT 1
)
SELECT 
  w.id,
  w.user_id,
  w.balance,
  w.updated_at,
  u.email
FROM public.wallets w
JOIN latest_user lu ON w.user_id = lu.id
JOIN public.users u ON w.user_id = u.id;
```

---

## 🔄 Integration with Auth Trigger

This trigger works seamlessly with the auth users trigger (`009_auth_users_trigger.sql`):

### Complete Flow

```
User Signs Up via Supabase Auth
    ↓
Auth trigger creates public.users record
    ↓
Wallet trigger creates public.wallets record
    ↓
✅ User and wallet both created automatically
```

### Example: Complete Signup Flow

1. **User signs up:**
```javascript
await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password123'
});
```

2. **Auth trigger fires:**
   - Creates record in `public.users`

3. **Wallet trigger fires:**
   - Creates record in `public.wallets` with `balance = 0`

4. **Result:**
   - User has account ✅
   - User has wallet ✅
   - Wallet balance is 0 ✅

---

## ✅ Benefits

1. **Automatic:** No manual code needed
2. **Consistent:** Always creates wallet for new users
3. **Safe:** Handles duplicates gracefully
4. **Reliable:** Runs at database level
5. **Simple:** One-time setup

---

## 📚 Related Documentation

- [Auth Users Trigger Setup](./AUTH_TRIGGER_SETUP.md)
- [RLS Audit Documentation](../SUPABASE_RLS_AUDIT.md)
- [Supabase Triggers Documentation](https://supabase.com/docs/guides/database/triggers)

---

## 🎯 Summary

**Trigger Name:** `on_user_created_wallet`  
**Function:** `handle_new_user_wallet()`  
**Event:** `AFTER INSERT` on `public.users`  
**Action:** Creates wallet with `balance = 0`  
**Duplicate Handling:** `ON CONFLICT (user_id) DO NOTHING`

---

**Last Updated:** 2025-12-17  
**Status:** ✅ Ready to Deploy  
**Trigger:** `on_user_created_wallet`  
**Function:** `handle_new_user_wallet()`

