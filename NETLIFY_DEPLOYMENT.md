# Netlify Deployment - Supabase Configuration

## 🚨 CRITICAL: Configure Supabase Environment Variables

Your site at https://otodial.netlify.app is deployed but **login will NOT work** until you configure Supabase!

## Quick Fix (2 minutes):

### Step 1: Get Supabase Credentials

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project (or create one if you haven't)
3. Click **Settings** (gear icon) → **API**
4. Copy these two values:
   - **Project URL** (example: `https://abcdefgh.supabase.co`)
   - **anon public** key (long string under "Project API keys")

### Step 2: Add to Netlify

1. Go to [Netlify Dashboard](https://app.netlify.com)
2. Click on your site **otodial**
3. Go to **Site Settings** → **Environment variables**
4. Click **Add a variable** and add:

```
Variable 1:
Key: VITE_SUPABASE_URL
Value: https://YOUR-PROJECT.supabase.co

Variable 2:
Key: VITE_SUPABASE_ANON_KEY
Value: your-anon-public-key-here
```

5. Click **Save**

### Step 3: Redeploy

1. Go to **Deploys** tab in Netlify
2. Click **Trigger deploy** → **Deploy site**
3. Wait for deployment to complete (~2 minutes)

### Step 4: Test

1. Visit https://otodial.netlify.app
2. Try to login or signup
3. Should work! ✅

## 📋 Detailed Guide

See [frontend/NETLIFY_SETUP.md](./frontend/NETLIFY_SETUP.md) for complete instructions.

## 🔍 Troubleshooting

**Problem**: Login still doesn't work after adding variables

**Solution**:
1. Make sure variable names are EXACTLY:
   - `VITE_SUPABASE_URL` (not SUPABASE_URL)
   - `VITE_SUPABASE_ANON_KEY` (not SUPABASE_KEY)
2. No extra spaces or quotes in the values
3. Make sure you clicked **Deploy site** after adding variables
4. Clear your browser cache and try again

**Problem**: Where do I find my Supabase project?

**Solution**: 
- Go to https://app.supabase.com
- If you don't see any projects, create a new one (free tier available)
- Project name can be anything (e.g., "otodial-backend")

## 📞 Need Help?

Check the browser console (F12 → Console tab) after visiting your site. You should see a clear error message if Supabase is not configured.

