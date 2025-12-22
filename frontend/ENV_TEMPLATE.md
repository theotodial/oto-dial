# Environment Variables Template

## 📋 Required Environment Variables

Copy the template below to create your `.env` file in the `frontend/` directory.

## ⚠️ IMPORTANT
- **NEVER** commit `.env` files with real credentials to Git
- The `.env` file is already in `.gitignore`
- For deployment, configure these in your hosting platform's dashboard

---

## 📝 Template for `.env` file

Create a file named `.env` in the `frontend/` directory with the following content:

```bash
# ==================================
# OTO-DIAL Frontend Environment Variables
# ==================================

# ----------------------------------
# Supabase Configuration (Required)
# ----------------------------------
# Get these from: https://app.supabase.com → Your Project → Settings → API

# Your Supabase project URL
# Example: https://abcdefghijklmn.supabase.co
VITE_SUPABASE_URL=your_supabase_url_here

# Your Supabase anonymous/public key (safe to expose in frontend)
# Example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here

# ----------------------------------
# Backend API Configuration
# ----------------------------------
# Backend API base URL
# Development: http://localhost:5000
# Production: Your deployed backend URL (e.g., https://api.otodial.com)
# Leave empty to use relative URLs (if backend and frontend are on same domain)
VITE_API_URL=http://localhost:5000
```

---

## 🔧 How to Get Your Credentials

### Supabase Credentials

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your **OTO-DIAL** project (or create a new one)
3. Click **Settings** → **API**
4. Copy:
   - **Project URL** → Use for `VITE_SUPABASE_URL`
   - **anon public** key → Use for `VITE_SUPABASE_ANON_KEY`

### Backend API URL

- **Local Development**: `http://localhost:5000`
- **Production**: Your deployed backend URL

---

## 🚀 Deployment Configuration

### For Netlify

1. Go to [Netlify Dashboard](https://app.netlify.com)
2. Select your site
3. Go to **Site Settings** → **Environment Variables**
4. Add each variable:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_API_URL` (optional, use your production API URL)

### For Vercel

1. Go to [Vercel Dashboard](https://vercel.com)
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. Add each variable for **Production**, **Preview**, and **Development** environments

---

## 📌 Important Notes

### About VITE_ Prefix

- All variables **must** be prefixed with `VITE_` to be accessible in the frontend
- This is a Vite requirement for exposing env vars to the browser
- Example: `VITE_SUPABASE_URL` ✅, `SUPABASE_URL` ❌

### Security Best Practices

1. ✅ **DO** use `VITE_` prefix for frontend variables
2. ✅ **DO** use Supabase anon/public key (it's designed to be public)
3. ✅ **DO** commit `.env.example` or this template
4. ❌ **DON'T** commit `.env` with real values
5. ❌ **DON'T** put backend secrets or service role keys here
6. ❌ **DON'T** put private API keys in frontend environment variables

### Supabase Keys Explained

- **Anon Key** (Public): ✅ Safe to use in frontend, limited permissions
- **Service Role Key** (Private): ❌ NEVER use in frontend, full admin access

---

## 🔍 Troubleshooting

### "Supabase not configured" error

**Solution:**
1. Make sure `.env` file exists in `frontend/` directory
2. Verify variable names are correct (with `VITE_` prefix)
3. Restart your dev server: `npm run dev`
4. Check browser console for specific error messages

### API calls failing

**Solution:**
1. Check `VITE_API_URL` is set correctly
2. Make sure backend server is running
3. For production, verify the API URL is accessible
4. Check CORS settings on backend

### Environment variables not updating

**Solution:**
1. Stop the dev server
2. Update `.env` file
3. Restart: `npm run dev`
4. Clear browser cache if needed

---

## ✅ Quick Setup Checklist

- [ ] Copy template to `frontend/.env`
- [ ] Add Supabase URL
- [ ] Add Supabase anon key
- [ ] Set API URL (or leave as `http://localhost:5000` for local dev)
- [ ] Verify `.env` is in `.gitignore`
- [ ] Restart dev server
- [ ] Test login/authentication
- [ ] For production: Add env vars to Netlify/Vercel dashboard

---

## 📚 Related Documentation

- [NETLIFY_SETUP.md](./NETLIFY_SETUP.md) - Netlify deployment guide
- [README_NETLIFY.md](./README_NETLIFY.md) - Quick Netlify reference
- [SUPABASE_OAUTH_SETUP.md](../SUPABASE_OAUTH_SETUP.md) - OAuth configuration

---

**Last Updated:** 2025-12-17

