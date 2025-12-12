# Deployment Guide

## A. Deploying Backend to Render

1. **Create a new Web Service**
   - Go to [Render Dashboard](https://dashboard.render.com)
   - Click **"New +"** → **"Web Service"**

2. **Connect Repository**
   - Choose **"Connect a repository"** and select your GitHub repo
   - OR choose **"Deploy a folder"** and upload the `backend/` folder

3. **Configure Service**
   - **Name**: `oto-dial-backend` (or your preferred name)
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node index.js`
   - **Plan**: Free

4. **Set Environment Variables**
   - Go to **Environment** tab
   - Add: `PORT` = `10000`
   - (Render uses port 10000 for free tier services)

5. **Deploy**
   - Click **"Create Web Service"**
   - Wait for deployment to complete
   - Note your public URL (e.g., `https://oto-dial-backend.onrender.com`)

---

## B. Deploying Frontend to Vercel

1. **Import Repository**
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Click **"Add New..."** → **"Project"**
   - Import your GitHub repository

2. **Configure Project**
   - **Root Directory**: Set to `frontend`
   - **Framework Preset**: Vite (auto-detected)
   - **Build Command**: `npm run build` (auto-detected)
   - **Output Directory**: `dist` (auto-detected)

3. **Set Environment Variables**
   - Go to **Environment Variables**
   - Add: `VITE_API_URL` = `https://YOUR_BACKEND_URL.onrender.com`
     - Replace `YOUR_BACKEND_URL` with your actual Render backend URL
   - Select **Production** (and **Preview** if needed)

4. **Deploy**
   - Click **"Deploy"**
   - Wait for build and deployment to complete
   - Note your public URL (e.g., `https://oto-dial.vercel.app`)

---

## C. Testing Deployed Site

### Test Backend (Render)

1. **Check API Endpoint**
   - Open: `https://YOUR_BACKEND_URL.onrender.com/api/auth/login`
   - Should return an error (expected - needs POST with credentials)
   - Or test: `https://YOUR_BACKEND_URL.onrender.com/`
   - Should return: `{"status":"OK"}`

### Test Frontend (Vercel)

1. **Open Frontend URL**
   - Visit your Vercel deployment URL

2. **Test Signup**
   - Go to Signup page
   - Create a new account
   - Should redirect to Login

3. **Test Login**
   - Login with your credentials
   - Should redirect to Dashboard

4. **Test Dashboard**
   - View wallet balance
   - Top up wallet
   - Buy a phone number

5. **Test Calls**
   - Go to Dialer page
   - Use dialpad to enter a number
   - Make a test call
   - Check call history

6. **Test Chat**
   - Go to Chat page
   - Send a message
   - Verify AI response appears

---

## Troubleshooting

- **Backend not responding**: Check Render logs, verify PORT=10000
- **Frontend can't connect**: Verify `VITE_API_URL` matches your Render backend URL
- **CORS errors**: Ensure backend CORS allows your Vercel domain
- **404 on routes**: Ensure React Router is configured for client-side routing

