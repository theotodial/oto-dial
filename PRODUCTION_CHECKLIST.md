# 🚀 OTO DIAL - Production Deployment Checklist

Use this checklist to ensure everything is ready for production deployment.

## 📋 Pre-Deployment

### Repository Setup
- [ ] All sensitive files in `.gitignore`
- [ ] `.env.example` files created for both frontend and backend
- [ ] No hardcoded secrets in code
- [ ] All environment variables documented
- [ ] README updated with deployment instructions

### Environment Variables

#### Backend (.env)
- [ ] `MONGODB_URI` - Production MongoDB connection string
- [ ] `PORT=5000` - Backend port
- [ ] `NODE_ENV=production` - Set to production
- [ ] `FRONTEND_URL` - Full frontend URL (https://yourdomain.com)
- [ ] `JWT_SECRET` - Strong random string (32+ characters)
- [ ] `JWT_EXPIRES_IN=7d` - JWT expiration
- [ ] `STRIPE_SECRET_KEY` - Stripe production key (sk_live_...)
- [ ] `STRIPE_PUBLISHABLE_KEY` - Stripe production key (pk_live_...)
- [ ] `STRIPE_WEBHOOK_SECRET` - Stripe webhook secret
- [ ] `TELNYX_API_KEY` - Telnyx production API key
- [ ] `TELNYX_APP_ID` - Telnyx application ID
- [ ] `GOOGLE_CLIENT_ID` - Google OAuth client ID
- [ ] `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
- [ ] `GOOGLE_CALLBACK_URL` - https://yourdomain.com/api/auth/google/callback
- [ ] `EMAIL_HOST` - SMTP host
- [ ] `EMAIL_PORT` - SMTP port (587 for TLS)
- [ ] `EMAIL_USER` - SMTP username
- [ ] `EMAIL_PASS` - SMTP password/app password

#### Frontend (.env)
- [ ] `VITE_API_URL` - https://yourdomain.com (or empty for relative URLs)
- [ ] `VITE_NODE_ENV=production` - Environment

### Third-Party Services

#### Stripe
- [ ] Production API keys obtained
- [ ] Webhook endpoint configured: `https://yourdomain.com/api/webhooks/stripe`
- [ ] Webhook events selected:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
- [ ] Webhook secret copied to backend `.env`

#### Telnyx
- [ ] Production API key obtained
- [ ] Application created and ID obtained
- [ ] Voice webhook configured: `https://yourdomain.com/api/webhooks/telnyx/voice`
- [ ] SMS webhook configured: `https://yourdomain.com/api/webhooks/telnyx/sms`

#### Google OAuth
- [ ] OAuth 2.0 credentials created in Google Cloud Console
- [ ] Authorized redirect URI added: `https://yourdomain.com/api/auth/google/callback`
- [ ] Client ID and secret copied to backend `.env`

#### MongoDB
- [ ] Database created (local or Atlas)
- [ ] Connection string obtained
- [ ] Database user created with read/write permissions
- [ ] Network access configured (if using Atlas)

### VPS Setup

#### Server Configuration
- [ ] Ubuntu 20.04+ installed
- [ ] System updated (`apt update && apt upgrade`)
- [ ] Node.js 18+ installed
- [ ] PM2 installed globally
- [ ] Nginx installed
- [ ] MongoDB installed (if using local) or Atlas connection tested
- [ ] Firewall configured (UFW)
- [ ] SSH key-based authentication set up

#### Domain & SSL
- [ ] Domain name pointing to VPS IP
- [ ] DNS records configured (A record)
- [ ] SSL certificate obtained (Let's Encrypt)
- [ ] SSL auto-renewal configured

## 🔧 Deployment Steps

### Code Deployment
- [ ] Repository cloned to `/var/www/oto-dial`
- [ ] `.env` files created from `.env.example`
- [ ] All environment variables set correctly
- [ ] Backend dependencies installed (`npm install --production`)
- [ ] Frontend dependencies installed (`npm install`)
- [ ] Frontend built (`npm run build`)
- [ ] Build verified (`dist/index.html` exists)

### PM2 Configuration
- [ ] `ecosystem.config.js` configured
- [ ] PM2 process started (`pm2 start ecosystem.config.js`)
- [ ] PM2 process saved (`pm2 save`)
- [ ] PM2 startup script configured (`pm2 startup`)
- [ ] Logs directory created (`logs/`)

### Nginx Configuration
- [ ] Nginx config file created (`/etc/nginx/sites-available/oto-dial`)
- [ ] Domain name updated in config
- [ ] SSL certificate paths configured
- [ ] Symbolic link created (`/etc/nginx/sites-enabled/oto-dial`)
- [ ] Nginx config tested (`nginx -t`)
- [ ] Nginx reloaded (`systemctl reload nginx`)

## ✅ Post-Deployment Verification

### Health Checks
- [ ] Backend health endpoint: `curl https://yourdomain.com/api/health`
- [ ] Returns: `{"success":true,"status":"ok",...}`
- [ ] PM2 process running: `pm2 status`
- [ ] Backend logs: `pm2 logs oto-dial-backend` (no errors)

### Application Testing
- [ ] Frontend loads at `https://yourdomain.com`
- [ ] No console errors in browser
- [ ] Signup page loads
- [ ] Login page loads
- [ ] Google OAuth button works
- [ ] Email/password login works
- [ ] Dashboard loads after login
- [ ] API calls working (check Network tab)
- [ ] CORS errors resolved

### Feature Testing
- [ ] Stripe checkout flow
- [ ] Subscription activation
- [ ] Phone number purchase
- [ ] Making calls
- [ ] Sending SMS
- [ ] Receiving calls (Telnyx webhook)
- [ ] Receiving SMS (Telnyx webhook)
- [ ] User profile update
- [ ] Contact form submission

### Security Checks
- [ ] HTTPS enforced (no HTTP access)
- [ ] SSL certificate valid (check browser padlock)
- [ ] Security headers present (check browser DevTools)
- [ ] No sensitive data in frontend build
- [ ] `.env` files not accessible via web
- [ ] Firewall blocking unnecessary ports
- [ ] Strong JWT_SECRET (not default value)

### Performance Checks
- [ ] Page load time acceptable (< 3 seconds)
- [ ] API response times acceptable (< 500ms)
- [ ] Static assets cached (check browser Network tab)
- [ ] Gzip compression enabled (check Response Headers)

## 🔄 Ongoing Maintenance

### Monitoring
- [ ] PM2 monitoring setup
- [ ] Log rotation configured
- [ ] Error tracking (consider Sentry)
- [ ] Uptime monitoring (consider UptimeRobot)

### Backups
- [ ] MongoDB backups configured
- [ ] Backup schedule set (daily recommended)
- [ ] Backup restoration tested
- [ ] Environment variables backed up securely

### Updates
- [ ] Update process documented
- [ ] Rollback plan documented
- [ ] Change log maintained

## 🐛 Troubleshooting Reference

### Common Issues
- [ ] PM2 not starting: Check logs, verify environment variables
- [ ] Nginx 502: Check backend is running on port 5000
- [ ] CORS errors: Verify FRONTEND_URL in backend .env
- [ ] 404 on routes: Check Nginx try_files directive
- [ ] SSL errors: Verify certificate paths and permissions

## 📝 Notes

- Keep `.env` files backed up securely (never commit to git)
- Document any custom configurations
- Keep deployment log with timestamps
- Test in staging environment first if possible

---

**Last Updated:** $(date)
**Deployed By:** [Your Name]
**Deployment Date:** [Date]

