# Supabase OAuth Configuration Guide

## 🔐 Setting Up OAuth Server for OTO-DIAL

Follow these steps to enable OAuth server functionality in your Supabase project.

## Step 1: Enable OAuth Server in Supabase

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your **OTO-DIAL** project
3. Navigate to **Authentication** → **OAuth**
4. Click **Enable OAuth Server**
5. Toggle the switch to enable OAuth server functionality

## Step 2: Configure Site URL

### In Supabase Dashboard:

1. Go to **Authentication** → **URL Configuration**
2. Set the **Site URL** to:
   ```
   https://otodial.netlify.app
   ```
3. Click **Save**

### Additional Allowed URLs (Optional):

Add these in **Authentication** → **URL Configuration** → **Redirect URLs**:

```
https://otodial.netlify.app/oauth/consent
https://otodial.netlify.app/login
https://otodial.netlify.app/dashboard
http://localhost:5173 (for local development)
```

## Step 3: Configure OAuth Settings

### Authorization Path:

The authorization path is already implemented in the code at:
```
/oauth/consent
```

Full URL:
```
https://otodial.netlify.app/oauth/consent
```

### What this means:

- When users authorize third-party apps to access their OTO-DIAL account
- They'll be redirected to: `https://otodial.netlify.app/oauth/consent`
- The consent screen will show what permissions the app is requesting
- Users can approve or deny the request

## Step 4: Verify the Configuration

### Test Authorization URL:

You can test the OAuth flow by visiting:
```
https://otodial.netlify.app/oauth/consent?client_id=test&redirect_uri=https://example.com&scope=read
```

### Expected Behavior:

1. User is redirected to the consent page
2. If not logged in, redirected to login first
3. After login, sees the OAuth consent screen
4. Can approve or deny the authorization request
5. Redirected back to the requesting application

## Step 5: Configure OAuth Applications (If Needed)

### Creating an OAuth Application:

1. In Supabase Dashboard: **Authentication** → **OAuth** → **Applications**
2. Click **Create Application**
3. Fill in:
   - **Name**: Your app name
   - **Redirect URIs**: Where to send users after authorization
   - **Scopes**: What permissions the app needs (read, write, etc.)
4. Click **Create**
5. Save your **Client ID** and **Client Secret** (secret shown only once!)

### OAuth Flow Parameters:

When redirecting to authorization:
```
https://otodial.netlify.app/oauth/consent?
  client_id=YOUR_CLIENT_ID&
  redirect_uri=YOUR_REDIRECT_URI&
  scope=read+write&
  state=RANDOM_STATE_STRING
```

## Step 6: Netlify Environment Variables (Already Set)

Make sure these are configured in Netlify (from previous setup):

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Step 7: Deploy Changes

The OAuth consent page is now implemented. Deploy to Netlify:

```bash
git add .
git commit -m "feat: Add OAuth consent page"
git push origin main
```

Or trigger deploy in Netlify Dashboard → **Deploys** → **Trigger deploy**

## 🔍 Troubleshooting

### Issue: "Invalid OAuth request"

**Solution:**
- Make sure the URL includes required parameters: `client_id` and `redirect_uri`
- Example: `/oauth/consent?client_id=abc123&redirect_uri=https://app.com`

### Issue: "Redirect URI mismatch"

**Solution:**
- Add the redirect URI to Supabase **Authentication** → **URL Configuration** → **Redirect URLs**

### Issue: OAuth consent page shows error

**Solution:**
1. Check browser console for errors
2. Verify Supabase environment variables are set in Netlify
3. Make sure Site URL is configured correctly in Supabase

## 📋 Configuration Checklist

- [ ] OAuth Server enabled in Supabase
- [ ] Site URL set to `https://otodial.netlify.app`
- [ ] Authorization Path: `/oauth/consent` (already in code)
- [ ] Redirect URLs configured in Supabase
- [ ] Environment variables set in Netlify
- [ ] Code deployed to Netlify
- [ ] OAuth consent page accessible at: `https://otodial.netlify.app/oauth/consent`

## 🔗 Quick Links

- **Supabase Dashboard**: https://app.supabase.com
- **Netlify Dashboard**: https://app.netlify.com
- **OAuth Consent URL**: https://otodial.netlify.app/oauth/consent
- **Supabase OAuth Docs**: https://supabase.com/docs/guides/auth/social-login

## 📝 Notes

- The OAuth consent page is implemented in `frontend/src/pages/OAuthConsent.jsx`
- Users must be logged in to authorize applications
- Authorization codes are generated securely
- All OAuth flows follow industry standards (OAuth 2.0)

## 🛡️ Security Best Practices

1. ✅ Always verify redirect URIs
2. ✅ Use state parameter to prevent CSRF attacks
3. ✅ Never expose client secrets in frontend code
4. ✅ Implement proper scope validation
5. ✅ Log all authorization attempts
6. ✅ Allow users to revoke access anytime

---

**After completing these steps**, your OAuth server will be fully functional and third-party applications can request authorization from your users!

