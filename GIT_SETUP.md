# Git Setup Guide

## Prerequisites

**Install Git** (if not already installed):
- Download from [git-scm.com](https://git-scm.com/downloads)
- Or install via package manager (e.g., `choco install git` on Windows)

---

## Initial Repository Setup

Follow these steps to initialize git, push to GitHub, and connect to deployment services.

---

## 1. Initialize Git Repository

1. **Open terminal in project root**
   ```bash
   cd oto-dial
   ```

2. **Initialize Git** (if not already initialized)
   ```bash
   git init
   ```

3. **Add all files**
   ```bash
   git add .
   ```

4. **Create initial commit**
   ```bash
   git commit -m "Initial commit: OTO-DIAL full-stack application"
   ```

---

## 2. Create GitHub Repository

1. **Go to GitHub**
   - Visit [github.com](https://github.com) and sign in
   - Click **"+"** in the top right → **"New repository"**

2. **Repository Settings**
   - **Repository name**: `oto-dial` (or your preferred name)
   - **Description**: "Full-stack VoIP/SMS platform"
   - **Visibility**: Public or Private (your choice)
   - **DO NOT** initialize with README, .gitignore, or license (we already have these)
   - Click **"Create repository"**

3. **Copy Repository URL**
   - Copy the HTTPS URL (e.g., `https://github.com/username/oto-dial.git`)

---

## 3. Push Initial Commit

1. **Add Remote Repository**
   ```bash
   git remote add origin https://github.com/username/oto-dial.git
   ```
   (Replace with your actual repository URL)

2. **Rename Default Branch** (if needed)
   ```bash
   git branch -M main
   ```

3. **Push to GitHub**
   ```bash
   git push -u origin main
   ```

4. **Verify**
   - Refresh your GitHub repository page
   - You should see all your files

---

## 4. Connect Vercel to Repository

1. **Go to Vercel Dashboard**
   - Visit [vercel.com/dashboard](https://vercel.com/dashboard)
   - Sign in with GitHub

2. **Import Project**
   - Click **"Add New..."** → **"Project"**
   - Select your `oto-dial` repository
   - Click **"Import"**

3. **Configure Project**
   - **Root Directory**: Set to `frontend`
   - **Framework Preset**: Vite (auto-detected)
   - **Build Command**: `npm run build` (auto-detected)
   - **Output Directory**: `dist` (auto-detected)

4. **Set Environment Variables**
   - Go to **Environment Variables**
   - Add: `VITE_API_URL` = `https://YOUR_BACKEND_URL.onrender.com`
   - Select **Production** environment

5. **Deploy**
   - Click **"Deploy"**
   - Wait for build to complete

---

## 5. Connect Render to Repository

1. **Go to Render Dashboard**
   - Visit [dashboard.render.com](https://dashboard.render.com)
   - Sign in with GitHub

2. **Create Web Service**
   - Click **"New +"** → **"Web Service"**
   - Click **"Connect a repository"**
   - Select your `oto-dial` repository

3. **Configure Service**
   - **Name**: `oto-dial-backend`
   - **Root Directory**: `backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node index.js`
   - **Plan**: Free

4. **Set Environment Variables**
   - Go to **Environment** tab
   - Add: `PORT` = `10000`

5. **Deploy**
   - Click **"Create Web Service"**
   - Wait for deployment to complete
   - Note your public URL

---

## 6. Update Frontend with Backend URL

1. **Get Backend URL from Render**
   - Copy the public URL (e.g., `https://oto-dial-backend.onrender.com`)

2. **Update Vercel Environment Variable**
   - Go to Vercel project settings
   - Update `VITE_API_URL` with your Render backend URL
   - Redeploy the frontend

3. **Update vercel.json** (if using rewrites)
   - Update `vercel.json` in `frontend/` with your backend URL
   - Commit and push changes

---

## Future Updates

After initial setup, to deploy updates:

1. **Make changes locally**
2. **Commit changes**
   ```bash
   git add .
   git commit -m "Your commit message"
   ```
3. **Push to GitHub**
   ```bash
   git push
   ```
4. **Vercel and Render will automatically deploy** the updates

---

## Troubleshooting

- **Git authentication issues**: Use GitHub Personal Access Token or SSH keys
- **Vercel build fails**: Check build logs in Vercel dashboard
- **Render deployment fails**: Check logs in Render dashboard
- **API connection issues**: Verify `VITE_API_URL` matches your Render backend URL

