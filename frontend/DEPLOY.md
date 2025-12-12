# Vercel Deployment Guide

## Build Locally (Optional)

### Setup Environment Variables

Create `.env` file in the `frontend/` directory for local development:
```env
VITE_API_URL=http://localhost:5000
```

For production builds locally, create `.env.production`:
```env
VITE_API_URL=https://YOUR_BACKEND_URL
```

### Build

Test the production build:

```bash
npm run build
```

This creates a `dist/` folder with optimized production files.

## Deploy to Vercel

### Automatic Deployment

1. Connect your GitHub repository to Vercel
2. Set the **Root Directory** to `frontend`
3. Vercel will automatically:
   - Detect the Vite project
   - Run `npm install`
   - Run `npm run build`
   - Deploy the `dist/` folder

### Environment Variables

**Required:** Set `VITE_API_URL` to your backend URL.

#### Local Development

Create `.env` file in the `frontend/` directory:
```env
VITE_API_URL=http://localhost:5000
```

For production builds locally, create `.env.production`:
```env
VITE_API_URL=https://YOUR_BACKEND_URL
```

#### Vercel Deployment

**Option 1: Using Vercel Environment Variables (Recommended)**

1. Go to **Project Settings → Environment Variables** in Vercel dashboard
2. Click **Add New**
3. Add:
   - **Key**: `VITE_API_URL`
   - **Value**: Your backend URL (e.g., `https://oto-dial-backend.onrender.com`)
   - **Environment**: Production (and Preview if needed)
4. Redeploy your application

**Option 2: Using vercel.json Rewrites**

If `VITE_API_URL` is not set, API calls use relative paths (`/api/*`) and rely on `vercel.json` rewrites. Make sure to update `vercel.json` with your backend URL.

### API Configuration

- **No backend runs on Vercel** - this is frontend-only
- API calls (`/api/*`) are rewritten to your backend URL via `vercel.json`
- Update `vercel.json` with your actual backend URL before deploying

### Manual Deploy

If using Vercel CLI:

```bash
npm install -g vercel
cd frontend
vercel
```

