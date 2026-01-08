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

### Backend API URL

- **Local Development**: `http://localhost:5000`
- **Production**: Your deployed backend URL

---

## 🚀 Deployment Configuration

### For Netlify

1. Go to [Netlify Dashboard](https://app.netlify.com)
2. Select your site
3. Go to **Site Settings** → **Environment Variables**
4. Add variable:
   - `VITE_API_URL` (optional, use your production API URL)

### For Vercel

1. Go to [Vercel Dashboard](https://vercel.com)
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. Add variable for **Production**, **Preview**, and **Development** environments

---

## 📌 Important Notes

### About VITE_ Prefix

- All variables **must** be prefixed with `VITE_` to be accessible in the frontend
- This is a Vite requirement for exposing env vars to the browser
- Example: `VITE_API_URL` ✅, `API_URL` ❌

### Security Best Practices

1. ✅ **DO** use `VITE_` prefix for frontend variables
2. ✅ **DO** commit `.env.example` or this template
3. ❌ **DON'T** commit `.env` with real values
4. ❌ **DON'T** put backend secrets or private API keys in frontend environment variables

---

## 🔍 Troubleshooting

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
- [ ] Set API URL (or leave as `http://localhost:5000` for local dev)
- [ ] Verify `.env` is in `.gitignore`
- [ ] Restart dev server
- [ ] Test login/authentication
- [ ] For production: Add env vars to Netlify/Vercel dashboard

---

**Last Updated:** 2025-12-17
