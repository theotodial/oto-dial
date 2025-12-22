# RLS Quick Reference Guide

## 🚀 Quick Setup

### 1. Enable RLS (One-Time Setup)

Run in Supabase SQL Editor:

```sql
-- Copy and paste contents of: supabase/sql/007_enable_rls.sql
```

Or use Supabase CLI:

```bash
supabase db execute -f supabase/sql/007_enable_rls.sql
```

### 2. Verify RLS Status

Run in Supabase SQL Editor:

```sql
-- Copy and paste contents of: supabase/sql/008_audit_rls.sql
```

---

## ✅ Security Checklist

- [ ] RLS enabled on all 5 tables
- [ ] Policies use `auth.uid() = user_id`
- [ ] Anonymous access blocked
- [ ] Frontend uses anon key only
- [ ] Backend uses service role (server-side only)
- [ ] No service role in frontend code

---

## 🔍 Quick Verification

### Check RLS Status
```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('users', 'wallets', 'phone_numbers', 'calls', 'messages');
```

### Check Policies
```sql
SELECT tablename, policyname, cmd 
FROM pg_policies 
WHERE schemaname = 'public';
```

### Check Anonymous Access
```sql
SELECT tablename, policyname 
FROM pg_policies 
WHERE schemaname = 'public' 
  AND ('anon' = ANY(roles) OR 'public' = ANY(roles));
```
**Expected:** Empty result (no anonymous access)

---

## 📋 Tables & Policies

| Table | RLS | Policies | User Access |
|-------|-----|----------|-------------|
| users | ✅ | SELECT, UPDATE | Own record only |
| wallets | ✅ | SELECT, UPDATE | Own wallet only |
| phone_numbers | ✅ | SELECT, INSERT, UPDATE, DELETE | Own numbers only |
| calls | ✅ | SELECT, INSERT, UPDATE, DELETE | Own calls only |
| messages | ✅ | SELECT, INSERT, UPDATE, DELETE | Own messages only |

---

## 🔐 Key Security Rules

1. **Frontend:** Always use `VITE_SUPABASE_ANON_KEY`
2. **Backend:** Use `SUPABASE_SERVICE_ROLE_KEY` (server-side only)
3. **Policies:** Always check `auth.uid() = user_id`
4. **Anonymous:** Block all anonymous access
5. **Service Role:** Never expose to frontend

---

## 🚨 Common Issues

### Issue: "new row violates row-level security policy"

**Cause:** RLS policy doesn't allow the operation

**Fix:** 
- Check if RLS is enabled
- Verify policy exists for the operation
- Ensure `user_id = auth.uid()` in policy

### Issue: "permission denied for table"

**Cause:** No policy allows the operation

**Fix:**
- Create appropriate policy
- Ensure policy uses `auth.uid()`

### Issue: Can't access data after enabling RLS

**Cause:** Policies not created or incorrect

**Fix:**
- Run `007_enable_rls.sql` again
- Verify policies exist
- Check policy conditions

---

**For detailed information, see:** `SUPABASE_RLS_AUDIT.md`

