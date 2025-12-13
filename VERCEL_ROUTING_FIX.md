# Vercel NOT_FOUND Error - Complete Fix Guide

## Summary of Changes

1. **Fixed `frontend/vercel.json`**:
   - Changed: `"destination": "/"` → `"destination": "/index.html"`
   - Why: Vercel needs to know which actual file to serve

2. **Added Root Route to React Router**:
   - Added: `<Route path="/" element={<Home />} />`
   - Why: React Router needs a component to render for the root path

3. **Removed Conflicting Config**:
   - Deleted: Root `vercel.json` file
   - Why: Only one `vercel.json` should exist, preferably in the build directory

## Key Concepts

### Server-Side vs Client-Side Routing

**Server-Side (Traditional):**
- Each URL path = different file on server
- `/dashboard` → `dashboard.html` file exists

**Client-Side (SPA):**
- All paths → same `index.html` file
- React Router handles routing in browser
- `/dashboard` doesn't exist as file, but React Router renders `<Dashboard />` component

### Why Rewrites Are Needed

When you visit `/dashboard`:
1. Browser requests `/dashboard` from Vercel
2. Vercel looks for `dashboard.html` → doesn't exist ❌
3. **WITHOUT rewrite**: Vercel returns 404
4. **WITH rewrite**: Vercel serves `/index.html` → React Router handles `/dashboard` ✅

## Mental Model

```
User visits: /dashboard
     ↓
Vercel rewrite: /dashboard → /index.html
     ↓
Browser loads: index.html (with React app)
     ↓
React Router sees: /dashboard in URL
     ↓
React Router renders: <Dashboard /> component
     ↓
User sees: Dashboard page ✅
```

## Warning Signs

Watch for these patterns:
- ❌ `"destination": "/"` in vercel.json
- ❌ No root route in React Router
- ❌ Multiple vercel.json files
- ❌ Routes work locally but 404 in production
- ❌ Refresh on deep route returns 404

## Testing

After deployment, test:
1. Visit `/` → Should show home page
2. Visit `/dashboard` → Should show dashboard (not 404)
3. Refresh on `/dashboard` → Should still work (not 404)
4. Navigate between routes → Should work smoothly

