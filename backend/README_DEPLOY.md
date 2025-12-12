# Render Deployment Guide

## How Render Deploys Node.js Services

Render automatically:
1. Detects Node.js from `package.json`
2. Runs `npm install` (via `buildCommand` in `render.yaml`)
3. Starts the service with `node index.js` (via `startCommand`)
4. Assigns a public URL once deployed

## Deployment Steps

1. **Connect your repository** to Render
2. **Create a new Web Service**
3. **Select your backend folder** (or use `render.yaml` for automatic setup)
4. Render will use `render.yaml` configuration automatically if present

## Environment Variables

Add environment variables in Render:
1. Go to your service dashboard
2. Navigate to **Environment** tab
3. Add key-value pairs:
   - `PORT` is already set to `10000` in `render.yaml`
   - Add other variables as needed (e.g., `NODE_ENV=production`)

## Finding Your Public URL

1. After deployment, go to your service dashboard
2. The **Public URL** is displayed at the top (e.g., `https://oto-dial-backend.onrender.com`)
3. Use this URL in:
   - Frontend `vercel.json` rewrites
   - Frontend environment variable `VITE_API_URL`

## Manual Deployment

If not using `render.yaml`, configure manually:
- **Build Command**: `npm install`
- **Start Command**: `node index.js`
- **Environment**: `Node`
- **Plan**: Free tier

