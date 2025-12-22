# Auth Users Trigger Setup

**Purpose:** Automatically create `public.users` record when a user signs up via Supabase Auth.

---

## 🎯 Overview

This trigger automatically creates a corresponding record in `public.users` whenever a new user is created in `auth.users` (Supabase Auth).

### Features

- ✅ Runs automatically after `auth.users` INSERT
- ✅ Uses `auth.uid()` (from `auth.users.id`) as the user ID
- ✅ Stores email from `auth.users.email`
- ✅ Safely ignores duplicates (by ID or email)
- ✅ Extracts name from user metadata if available
- ✅ Does NOT modify existing tables

---

## 📋 Trigger Details

### Function: `handle_new_user()`

**Trigger Event:** `AFTER INSERT` on `auth.users`  
**Trigger Type:** `FOR EACH ROW`  
**Security:** `SECURITY DEFINER` (runs with elevated privileges)

### What It Does

1. **Captures New User**
   - Triggered when a user signs up via Supabase Auth
   - Receives the new `auth.users` record as `NEW`

2. **Creates Public User Record**
   - Inserts into `public.users` table
   - Uses `NEW.id` (which is `auth.uid()`) as the user ID
   - Copies email from `auth.users.email`
   - Sets `password_hash` to empty string (not needed with Supabase Auth)
   - Extracts name from `raw_user_meta_data` if available
   - Sets `created_at` to current timestamp

3. **Handles Duplicates**
   - Uses `ON CONFLICT (id) DO NOTHING` - ignores if user ID already exists
   - Uses `ON CONFLICT (email) DO NOTHING` - ignores if email already exists
   - Prevents errors from duplicate inserts

---

## 🚀 Setup Instructions

### Step 1: Run the SQL Script

1. Go to **Supabase Dashboard**
2. Navigate to **SQL Editor**
3. Copy and paste the contents of `supabase/sql/009_auth_users_trigger.sql`
4. Click **Run**

Or use Supabase CLI:

```bash
supabase db execute -f supabase/sql/009_auth_users_trigger.sql
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
WHERE trigger_schema = 'auth'
  AND event_object_table = 'users'
  AND trigger_name = 'on_auth_user_created';
```

**Expected Result:**
```
trigger_name          | event_manipulation | event_object_table | action_statement
----------------------|-------------------|-------------------|------------------
on_auth_user_created  | INSERT            | users             | EXECUTE FUNCTION public.handle_new_user()
```

### Step 3: Test the Trigger

1. **Sign up a new user** via your application
2. **Check if record was created:**

```sql
SELECT * FROM public.users 
WHERE id = (SELECT id FROM auth.users ORDER BY created_at DESC LIMIT 1);
```

**Expected Result:** A new record in `public.users` with matching ID and email.

---

## 🔍 How It Works

### Flow Diagram

```
User Signs Up
    ↓
Supabase Auth creates record in auth.users
    ↓
Trigger fires: on_auth_user_created
    ↓
Function executes: handle_new_user()
    ↓
Inserts into public.users
    ↓
ON CONFLICT handles duplicates safely
    ↓
User record created ✅
```

### Example

**Before Signup:**
```sql
-- auth.users: (empty)
-- public.users: (empty)
```

**User signs up:**
```javascript
await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password123',
  options: {
    data: {
      name: 'John Doe'
    }
  }
});
```

**After Signup:**
```sql
-- auth.users:
-- id: '123e4567-e89b-12d3-a456-426614174000'
-- email: 'user@example.com'
-- ...

-- public.users:
-- id: '123e4567-e89b-12d3-a456-426614174000'  ← Same as auth.uid()
-- email: 'user@example.com'
-- password_hash: ''  ← Placeholder
-- name: 'John Doe'  ← From metadata
-- created_at: '2025-12-17 10:30:00'
```

---

## 🛡️ Security Considerations

### SECURITY DEFINER

The function uses `SECURITY DEFINER`, which means it runs with the privileges of the function owner (typically `postgres`). This is necessary because:

- The function needs to insert into `public.users`
- Regular users don't have direct INSERT permissions on `public.users`
- The trigger runs in the `auth` schema context

### Duplicate Handling

The trigger safely handles duplicates using:

```sql
ON CONFLICT (id) DO NOTHING
ON CONFLICT (email) DO NOTHING
```

This prevents errors if:
- The trigger runs multiple times
- A user record already exists
- There's a race condition

---

## 🔧 Troubleshooting

### Issue: Trigger not firing

**Check if trigger exists:**
```sql
SELECT * FROM information_schema.triggers 
WHERE trigger_name = 'on_auth_user_created';
```

**If missing, re-run the setup script.**

---

### Issue: User record not created

**Check function exists:**
```sql
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_name = 'handle_new_user';
```

**Check for errors:**
```sql
SELECT * FROM pg_stat_user_functions 
WHERE funcname = 'handle_new_user';
```

---

### Issue: Duplicate key error

**This should not happen** with `ON CONFLICT DO NOTHING`, but if it does:

1. Check if both conflict handlers are present
2. Verify table constraints match
3. Check for concurrent inserts

---

### Issue: Permission denied

**Grant necessary permissions:**
```sql
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated;
GRANT INSERT ON public.users TO postgres, anon, authenticated;
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
WHERE trigger_schema = 'auth'
  AND event_object_table = 'users';
```

### Check Function

```sql
SELECT 
  routine_name,
  routine_type,
  security_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'handle_new_user';
```

### Test Duplicate Handling

```sql
-- This should not error (duplicate ignored)
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at)
VALUES (
  gen_random_uuid(),
  'test@example.com',
  crypt('password', gen_salt('bf')),
  NOW()
);
```

---

## 🔄 Migration Notes

### Before This Trigger

- Frontend code manually inserted into `public.users` after signup
- Risk of race conditions
- Potential for missing user records

### After This Trigger

- Automatic user record creation
- No frontend code needed
- Guaranteed consistency
- Safe duplicate handling

### Frontend Code Update

**Before:**
```javascript
// Manual insert after signup
const { error } = await supabase
  .from('users')
  .insert({
    id: result.data.user.id,
    email: result.data.user.email,
    name: formData.name || null
  });
```

**After:**
```javascript
// No manual insert needed - trigger handles it automatically
// User record is created automatically by trigger
```

---

## ✅ Benefits

1. **Automatic:** No manual code needed
2. **Consistent:** Always creates user record
3. **Safe:** Handles duplicates gracefully
4. **Reliable:** Runs at database level
5. **Simple:** One-time setup

---

## 📚 Related Documentation

- [Supabase Triggers Documentation](https://supabase.com/docs/guides/database/triggers)
- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [RLS Audit Documentation](../SUPABASE_RLS_AUDIT.md)

---

**Last Updated:** 2025-12-17  
**Status:** ✅ Ready to Deploy  
**Trigger:** `on_auth_user_created`  
**Function:** `handle_new_user()`

