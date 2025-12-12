# Deployment Guide

This guide covers deploying OTO-DIAL to production:
- **Frontend** → Vercel
- **Backend** → Render (or Railway)

## Prerequisites

- GitHub repository (or GitLab/Bitbucket) with your code
- Accounts on:
  - [Vercel](https://vercel.com) (free tier available)
  - [Render](https://render.com) (free tier available) or [Railway](https://railway.app)

---

## Part A: Frontend Deployment to Vercel

### Step 1: Prepare Frontend for Production

1. **Update Vite Config** (if needed):

   Ensure `vite.config.js` has proper build settings:
   
   ```js
   import { defineConfig } from 'vite';
   import react from '@vitejs/plugin-react';

   export default defineConfig({
     plugins: [react()],
     build: {
       outDir: 'dist',
     },
     server: {
       port: 3000,
       proxy: {
         '/api': {
           target: process.env.VITE_API_URL || 'http://localhost:5000',
           changeOrigin: true
         }
       }
     }
   });
   ```

2. **Create Environment Variables File** (optional, for local reference):

   Create `frontend/.env.production`:
   ```
   VITE_API_URL=https://your-backend.onrender.com
   ```

   **Note:** Vercel uses environment variables set in their dashboard, not `.env` files.

### Step 2: Deploy to Vercel

#### Option A: Deploy via Vercel Dashboard

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click **"Add New Project"**
3. Import your repository
4. Configure project:
   - **Framework Preset:** Vite
   - **Root Directory:** `frontend`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`

5. **Add Environment Variables:**
   - Go to **Settings** → **Environment Variables**
   - Add:
     - `VITE_API_URL` = `https://your-backend.onrender.com` (your backend URL)
   
6. Click **Deploy**

#### Option B: Deploy via Vercel CLI

1. Install Vercel CLI:
   ```bash
   npm install -g vercel
   ```

2. Navigate to frontend directory:
   ```bash
   cd frontend
   ```

3. Login to Vercel:
   ```bash
   vercel login
   ```

4. Deploy:
   ```bash
   vercel
   ```

5. For production:
   ```bash
   vercel --prod
   ```

6. Set environment variables:
   ```bash
   vercel env add VITE_API_URL production
   # Enter: https://your-backend.onrender.com
   ```

### Step 3: Update Frontend API Calls (if needed)

If your frontend uses hardcoded `http://localhost:5000`, update to use environment variable:

```js
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
```

Then replace all fetch URLs:
```js
fetch(`${API_URL}/api/endpoint`)
```

### Vercel Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | `https://oto-dial-backend.onrender.com` |

**Note:** Vite requires `VITE_` prefix for environment variables to be exposed to client-side code.

---

## Part B: Backend Deployment to Render

### Step 1: Prepare Backend for Production

1. **Update Backend Code** (if needed):

   Ensure `backend/index.js` uses environment variables:
   
   ```js
   const PORT = process.env.PORT || 5000;
   ```

2. **Update CORS** (if needed):

   Allow your Vercel frontend domain:
   
   ```js
   const corsOptions = {
     origin: process.env.FRONTEND_URL || 'http://localhost:3000',
     credentials: true
   };
   app.use(cors(corsOptions));
   ```

3. **Create `render.yaml`** (optional, for infrastructure as code):

   See `infra/render.yaml` (created below)

### Step 2: Deploy to Render

#### Via Render Dashboard

1. Go to [render.com](https://render.com) and sign in with GitHub
2. Click **"New +"** → **"Web Service"**
3. Connect your repository
4. Configure service:
   - **Name:** `oto-dial-backend` (or your preferred name)
   - **Environment:** Node
   - **Build Command:** `cd backend && npm install`
   - **Start Command:** `cd backend && npm start`
   - **Root Directory:** (leave empty or set to `backend`)

5. **Set Environment Variables:**
   - `PORT` = `5000` (Render sets this automatically, but you can override)
   - `FRONTEND_URL` = `https://your-frontend.vercel.app` (your Vercel URL)
   - `NODE_ENV` = `production`

6. **Plan Settings:**
   - Choose **Free** tier for testing
   - Auto-deploy: On (deploys on git push)

7. Click **"Create Web Service"**

8. **Note the Service URL:**
   - Render provides: `https://your-service.onrender.com`
   - Use this URL in your frontend `VITE_API_URL`

#### Via Render CLI (Alternative)

1. Install Render CLI:
   ```bash
   npm install -g render-cli
   ```

2. Login:
   ```bash
   render login
   ```

3. Create service from `render.yaml`:
   ```bash
   render deploy
   ```

### Step 3: Update CORS in Backend

After getting your Vercel frontend URL, update backend CORS:

```js
const corsOptions = {
  origin: [
    process.env.FRONTEND_URL,
    'http://localhost:3000' // For local development
  ],
  credentials: true
};
app.use(cors(corsOptions));
```

### Render Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port (auto-set by Render) | `5000` |
| `FRONTEND_URL` | Frontend URL for CORS | `https://oto-dial.vercel.app` |
| `NODE_ENV` | Environment | `production` |

---

## Alternative: Backend Deployment to Railway

### Step 1: Deploy to Railway

1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Select your repository
4. Railway auto-detects Node.js and sets up:
   - **Build Command:** `cd backend && npm install`
   - **Start Command:** `cd backend && npm start`

5. **Set Environment Variables:**
   - Click **Variables** tab
   - Add:
     - `PORT` = (Railway sets automatically)
     - `FRONTEND_URL` = `https://your-frontend.vercel.app`
     - `NODE_ENV` = `production`

6. **Get Service URL:**
   - Railway provides: `https://your-service.up.railway.app`
   - Use this in frontend `VITE_API_URL`

### Railway Environment Variables

Same as Render (see above table).

---

## Post-Deployment Checklist

### Frontend (Vercel)
- [ ] Set `VITE_API_URL` environment variable
- [ ] Verify API calls use environment variable (not hardcoded localhost)
- [ ] Test all features work with production backend
- [ ] Check CORS errors in browser console

### Backend (Render/Railway)
- [ ] Set `FRONTEND_URL` environment variable
- [ ] Verify CORS allows your Vercel domain
- [ ] Test health endpoint: `https://your-backend.onrender.com/`
- [ ] Verify all API endpoints respond correctly
- [ ] Check logs for errors

### Both
- [ ] Update frontend to use production backend URL
- [ ] Test authentication flow
- [ ] Test all CRUD operations
- [ ] Monitor application logs

---

## Common Issues

### CORS Errors

**Problem:** Browser shows CORS errors when frontend calls backend.

**Solution:**
1. Ensure `FRONTEND_URL` in backend matches your Vercel domain exactly
2. Include protocol: `https://your-app.vercel.app` (not just `your-app.vercel.app`)
3. Restart backend service after changing CORS settings

### Environment Variables Not Working (Frontend)

**Problem:** `import.meta.env.VITE_API_URL` is undefined.

**Solution:**
1. Ensure variable name starts with `VITE_`
2. Rebuild frontend after adding environment variables
3. Clear browser cache

### Backend Not Starting

**Problem:** Service fails to start on Render/Railway.

**Solution:**
1. Check build command includes `cd backend`
2. Verify `package.json` has correct `start` script
3. Check service logs in dashboard
4. Ensure `PORT` environment variable is set (or uses default)

### Free Tier Limitations

**Render Free Tier:**
- Service spins down after 15 minutes of inactivity
- First request may be slow (cold start)
- Consider upgrading for production

**Railway Free Tier:**
- Limited monthly usage
- May require credit card for some features

---

## Updating Deployments

### Frontend (Vercel)
- Push to main branch → Auto-deploys
- Or manually trigger in Vercel dashboard

### Backend (Render/Railway)
- Push to main branch → Auto-deploys (if enabled)
- Or manually deploy in dashboard

---

## Rollback

### Vercel
1. Go to **Deployments** tab
2. Click **"..."** on previous deployment
3. Select **"Promote to Production"**

### Render
1. Go to **Events** tab
2. Find previous successful deployment
3. Click **"Redeploy"**

---

## Monitoring

### Vercel
- Check **Analytics** for performance metrics
- View **Logs** for runtime errors

### Render
- Check **Logs** tab for application output
- Monitor **Metrics** for resource usage

---

## Security Notes

1. **Never commit `.env` files** to repository
2. **Use environment variables** for all sensitive data
3. **Enable HTTPS** (automatic on Vercel/Render)
4. **Review CORS settings** regularly
5. **Rotate secrets** if exposed

---

## Cost Considerations

### Free Tier Limits
- **Vercel:** 100GB bandwidth/month, unlimited builds
- **Render:** 750 hours/month (spins down when idle)
- **Railway:** $5 credit/month (usage-based)

For production with traffic, consider paid plans.

---

## Support

- [Vercel Docs](https://vercel.com/docs)
- [Render Docs](https://render.com/docs)
- [Railway Docs](https://docs.railway.app)

