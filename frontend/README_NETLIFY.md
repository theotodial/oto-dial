# 🚨 IMPORTANT: Netlify Configuration Required

## Your site is deployed but login won't work until you configure Supabase!

### Quick Fix (5 minutes):

1. **Go to Netlify Dashboard**: https://app.netlify.com
2. **Click on your site** (otodial)
3. **Site Settings** → **Environment variables**
4. **Add these 2 variables**:

```
VITE_SUPABASE_URL = https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY = your-anon-key-here
```

5. **Get the values from**: [Supabase Dashboard](https://app.supabase.com) → Project Settings → API
6. **Redeploy**: Deploys tab → Trigger deploy

### Where to get Supabase credentials:

🔗 https://app.supabase.com → Your Project → Settings → API

Copy:
- **Project URL** → Use as `VITE_SUPABASE_URL`
- **anon public key** → Use as `VITE_SUPABASE_ANON_KEY`

### Full setup guide:

See [NETLIFY_SETUP.md](./NETLIFY_SETUP.md) for detailed instructions.

---

**Current Status**: ❌ Supabase not configured (login will fail)

**After setup**: ✅ Login and authentication will work

