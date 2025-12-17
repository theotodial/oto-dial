# Netlify Deployment Setup Guide

## 🚀 Quick Setup

### 1. Configure Supabase Environment Variables in Netlify

**IMPORTANT:** Your app requires Supabase to be configured or login will fail!

1. Go to your Netlify dashboard: https://app.netlify.com
2. Select your site (otodial)
3. Go to **Site Settings** → **Environment Variables**
4. Add the following variables:

#### Required Variables:

| Variable Name | Value | Where to Get It |
|--------------|-------|-----------------|
| `VITE_SUPABASE_URL` | Your Supabase project URL | [Supabase Dashboard](https://app.supabase.com) → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon/public key | [Supabase Dashboard](https://app.supabase.com) → Project Settings → API → anon public key |
| `VITE_API_URL` | Your backend API URL (optional) | Example: `https://your-backend.com` |

### 2. Get Supabase Credentials

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project (or create a new one)
3. Click on **Settings** (gear icon) in the sidebar
4. Click on **API** in the settings menu
5. Copy the following:
   - **Project URL** (looks like: `https://xxxxxxxxxxxxx.supabase.co`)
   - **anon public** key (under "Project API keys")

### 3. Add Variables to Netlify

#### Method 1: Using Netlify UI (Recommended)

```
1. Netlify Dashboard → Your Site → Site Settings
2. Build & deploy → Environment variables
3. Click "Add a variable" or "Add environment variables"
4. Add each variable:
   - Key: VITE_SUPABASE_URL
   - Value: https://xxxxxxxxxxxxx.supabase.co
   - Scopes: Select "All environments" or specific ones
5. Click "Create variable"
6. Repeat for VITE_SUPABASE_ANON_KEY
```

#### Method 2: Using Netlify CLI

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login
netlify login

# Link to your site
netlify link

# Set environment variables
netlify env:set VITE_SUPABASE_URL "https://xxxxxxxxxxxxx.supabase.co"
netlify env:set VITE_SUPABASE_ANON_KEY "your-anon-key-here"
```

### 4. Redeploy Your Site

After adding environment variables:

#### Option A: Trigger New Deploy from Netlify UI
1. Go to **Deploys** tab
2. Click **Trigger deploy** → **Deploy site**

#### Option B: Push to GitHub
```bash
git commit --allow-empty -m "trigger rebuild"
git push origin main
```

### 5. Verify the Configuration

After deployment completes:

1. Visit your site: https://otodial.netlify.app
2. Try to log in or sign up
3. Check browser console (F12) for any errors
4. If you see "Supabase is not configured" warning, double-check your environment variables

## 🔍 Troubleshooting

### Issue: "Supabase not configured" error

**Solution:** Make sure you added both required environment variables in Netlify and redeployed.

### Issue: Login still doesn't work after adding variables

**Checklist:**
1. ✅ Environment variables are added in Netlify (not just locally)
2. ✅ Variable names match exactly: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
3. ✅ Values don't have extra quotes or spaces
4. ✅ Site was redeployed after adding variables
5. ✅ Supabase project is active and not paused

### Issue: How to check if variables are set correctly?

Add this temporary code to check (remove after testing):

```javascript
// Add to frontend/src/App.jsx temporarily
console.log('Supabase URL:', import.meta.env.VITE_SUPABASE_URL);
console.log('Has Supabase Key:', !!import.meta.env.VITE_SUPABASE_ANON_KEY);
```

Open browser console on deployed site to see the output.

## 📝 Local Development Setup

For local development, create a `.env` file in the `frontend/` directory:

```bash
# Copy the example file
cp .env.example .env

# Edit .env and add your real values
# Never commit this file to Git!
```

## 🔒 Security Notes

- ✅ The `anon` key is safe to expose in frontend code
- ✅ Never commit actual `.env` files to Git
- ✅ Use Row Level Security (RLS) in Supabase to protect data
- ❌ Never expose service_role keys in frontend code

## 📚 Additional Resources

- [Netlify Environment Variables Docs](https://docs.netlify.com/environment-variables/overview/)
- [Supabase JavaScript Client Docs](https://supabase.com/docs/reference/javascript/introduction)
- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)

## ✅ Deployment Checklist

- [ ] Supabase project created
- [ ] Environment variables added to Netlify
- [ ] Site redeployed after adding variables
- [ ] Login/Signup tested on live site
- [ ] No console errors related to Supabase

