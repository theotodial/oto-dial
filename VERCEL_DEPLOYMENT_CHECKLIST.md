# Vercel Deployment Checklist for https://oto-dial.vercel.app/

## ✅ IMMEDIATE FIX APPLIED

Updated `frontend/vercel.json` to remove problematic API rewrite.

## 🔧 VERCEL PROJECT SETTINGS TO CHECK

### 1. Root Directory
Go to: Vercel Dashboard → oto-dial → Settings → General

**Should be set to:** `frontend`

### 2. Build & Output Settings
Go to: Vercel Dashboard → oto-dial → Settings → Build & Development Settings

**Framework Preset:** Vite
**Build Command:** `npm run build`
**Output Directory:** `dist`
**Install Command:** `npm install`

### 3. Environment Variables
Go to: Vercel Dashboard → oto-dial → Settings → Environment Variables

**Add this variable:**
- **Name:** `VITE_API_URL`
- **Value:** `https://your-backend-url.onrender.com` (or your actual backend URL)
- **Environment:** Production (and Preview if needed)

### 4. Deployment Trigger
After updating settings:
1. Go to Deployments tab
2. Click "..." on latest deployment
3. Click "Redeploy"
4. Check "Use existing Build Cache" is OFF
5. Click "Redeploy"

## 🧪 TEST AFTER REDEPLOYMENT

1. **Homepage:** https://oto-dial.vercel.app/ ✅
2. **Dashboard:** https://oto-dial.vercel.app/dashboard ✅
3. **Refresh Test:** Navigate to any page, press F5 ✅
4. **Direct Link:** Copy URL from address bar, open in new tab ✅

## 🚨 COMMON ISSUES & FIXES

### Issue 1: Still Getting 404
**Cause:** Vercel cached old build
**Fix:** Redeploy without cache (see step 4 above)

### Issue 2: Blank Page
**Cause:** Wrong root directory
**Fix:** Set root directory to `frontend` in project settings

### Issue 3: Build Fails
**Cause:** Missing dependencies or wrong Node version
**Fix:** 
- Check build logs in Vercel dashboard
- Ensure Node version in Vercel matches your local (18.x recommended)

### Issue 4: API Calls Fail
**Cause:** Missing `VITE_API_URL` environment variable
**Fix:** Add environment variable in Vercel settings (see step 3 above)

## 📝 CURRENT CONFIGURATION

### frontend/vercel.json
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

This tells Vercel: "For ANY route, serve index.html and let React Router handle it"

### Why This Works
1. User visits `https://oto-dial.vercel.app/dashboard`
2. Vercel receives request for `/dashboard`
3. Vercel rewrites to `/index.html` (serves your React app)
4. React app loads
5. React Router sees URL is `/dashboard`
6. React Router renders Dashboard component
7. ✅ Page displays correctly

## 🔄 AFTER COMMITTING CHANGES

```bash
git add frontend/vercel.json
git commit -m "Fix Vercel 404: remove problematic API rewrite"
git push
```

Vercel will automatically redeploy when you push to main branch.

## ⏱️ WAIT TIME

After pushing:
- Vercel detects push: ~10 seconds
- Build starts: ~30-60 seconds
- Deployment completes: ~10 seconds
- **Total: ~1-2 minutes**

Check deployment status at: https://vercel.com/dashboard

## 🎯 VERIFICATION COMMANDS

Once deployed, test from terminal:

```bash
# Test homepage
curl -I https://oto-dial.vercel.app/

# Test dashboard route (should return 200, not 404)
curl -I https://oto-dial.vercel.app/dashboard

# Both should return: HTTP/2 200
```

## 💡 KEY POINT

The 404 error happens because:
- ❌ Vercel looks for file: `dist/dashboard/index.html`
- ❌ File doesn't exist
- ✅ With rewrite: All routes → `dist/index.html`
- ✅ React Router handles the rest

## 🆘 IF STILL NOT WORKING

1. Check Vercel deployment logs for errors
2. Verify `frontend/` is set as root directory
3. Clear Vercel cache and redeploy
4. Check browser console for JavaScript errors
5. Verify `dist/index.html` exists after build

## 📞 NEXT STEPS

1. ✅ Commit the `vercel.json` fix
2. ✅ Push to GitHub
3. ⏳ Wait for Vercel auto-deploy
4. 🧪 Test all routes
5. 🎉 Celebrate working deployment!

