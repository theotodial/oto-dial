# OTO DIAL - Production Deployment Guide

## 📋 Pre-Deployment Checklist

### ✅ Prerequisites
- [ ] Hostinger VPS with Ubuntu 20.04+ 
- [ ] Domain name configured and pointing to VPS IP
- [ ] SSH access to VPS
- [ ] MongoDB database (local or MongoDB Atlas)
- [ ] Stripe account with production API keys
- [ ] Telnyx account with production API key
- [ ] Google OAuth credentials (production)
- [ ] SSL certificate (Let's Encrypt recommended)

---

## 🚀 Step-by-Step Deployment

### 1. Initial VPS Setup

```bash
# Connect to your VPS
ssh root@your-vps-ip

# Update system
sudo apt update && sudo apt upgrade -y

# Install essential tools
sudo apt install -y curl wget git build-essential nginx certbot python3-certbot-nginx
```

### 2. Install Node.js (v18+)

```bash
# Install Node.js using NodeSource
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should be v18.x or higher
npm --version
```

### 3. Install PM2 (Process Manager)

```bash
sudo npm install -g pm2

# Setup PM2 to start on boot
pm2 startup systemd
# Follow the instructions displayed
```

### 4. Install MongoDB (or use MongoDB Atlas)

**Option A: Local MongoDB**
```bash
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt update
sudo apt install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod
```

**Option B: MongoDB Atlas (Recommended)**
- Create account at https://www.mongodb.com/cloud/atlas
- Create cluster and get connection string
- Use connection string in `.env` file

### 5. Clone Repository

```bash
# Create application directory
sudo mkdir -p /var/www/oto-dial
sudo chown -R $USER:$USER /var/www/oto-dial

# Clone repository
cd /var/www/oto-dial
git clone https://github.com/yourusername/oto-dial.git .

# Or if repository is private, use SSH:
# git clone git@github.com:yourusername/oto-dial.git .
```

### 6. Setup Environment Variables

```bash
# Backend environment
cd /var/www/oto-dial/backend
cp .env.example .env
nano .env  # Edit with your production values
```

**Required Backend Environment Variables:**
```env
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/oto-dial
PORT=5000
NODE_ENV=production
FRONTEND_URL=https://yourdomain.com

JWT_SECRET=generate-strong-random-string-here
JWT_EXPIRES_IN=7d

STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

TELNYX_API_KEY=your_telnyx_api_key
TELNYX_APP_ID=your_telnyx_app_id

GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=https://yourdomain.com/api/auth/google/callback

EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
```

```bash
# Frontend environment
cd /var/www/oto-dial/frontend
cp .env.example .env
nano .env  # Edit with your production values
```

**Required Frontend Environment Variables:**
```env
VITE_API_URL=https://yourdomain.com
VITE_NODE_ENV=production
```

### 7. Install Dependencies & Build

```bash
# Backend dependencies
cd /var/www/oto-dial/backend
npm install --production

# Frontend dependencies and build
cd /var/www/oto-dial/frontend
npm install
npm run build

# Verify build
ls -la dist/  # Should contain index.html and assets/
```

### 8. Setup PM2

```bash
cd /var/www/oto-dial

# Create logs directory
mkdir -p logs

# Start backend with PM2
pm2 start ecosystem.config.js

# Save PM2 process list
pm2 save

# Check status
pm2 status
pm2 logs oto-dial-backend
```

### 9. Configure Nginx

```bash
# Copy nginx configuration
sudo cp /var/www/oto-dial/nginx.conf /etc/nginx/sites-available/oto-dial

# Edit configuration with your domain
sudo nano /etc/nginx/sites-available/oto-dial
# Replace 'yourdomain.com' with your actual domain

# Create symbolic link
sudo ln -s /etc/nginx/sites-available/oto-dial /etc/nginx/sites-enabled/

# Remove default site (optional)
sudo rm /etc/nginx/sites-enabled/default

# Test Nginx configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

### 10. Setup SSL Certificate (Let's Encrypt)

```bash
# Install SSL certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Test auto-renewal
sudo certbot renew --dry-run

# Certbot will automatically configure HTTPS in nginx.conf
```

### 11. Configure Firewall

```bash
# Allow SSH, HTTP, HTTPS
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

### 12. Setup MongoDB Database (if using local)

```bash
# Connect to MongoDB
mongosh

# Create database and user (if needed)
use oto-dial
db.createUser({
  user: "otodial_user",
  pwd: "strong_password_here",
  roles: ["readWrite"]
})
```

---

## 🔧 Post-Deployment Configuration

### 1. Update Google OAuth Callback URL

In Google Cloud Console:
- Go to APIs & Services > Credentials
- Edit your OAuth 2.0 Client ID
- Add authorized redirect URI: `https://yourdomain.com/api/auth/google/callback`
- Save changes

### 2. Update Stripe Webhook URL

In Stripe Dashboard:
- Go to Developers > Webhooks
- Add endpoint: `https://yourdomain.com/api/webhooks/stripe`
- Select events: `checkout.session.completed`, `customer.subscription.*`
- Copy webhook secret to backend `.env` as `STRIPE_WEBHOOK_SECRET`

### 3. Update Telnyx Webhook URLs

In Telnyx Dashboard:
- Voice Webhook: `https://yourdomain.com/api/webhooks/telnyx/voice`
- SMS Webhook: `https://yourdomain.com/api/webhooks/telnyx/sms`

### 4. Test Application

```bash
# Check backend health
curl https://yourdomain.com/api/health

# Should return: {"success":true,"status":"ok","time":"..."}

# Check PM2 status
pm2 status
pm2 logs

# Check Nginx logs
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

---

## 🔄 Maintenance Commands

### PM2 Commands
```bash
# View logs
pm2 logs oto-dial-backend

# Restart application
pm2 restart oto-dial-backend

# Stop application
pm2 stop oto-dial-backend

# Monitor
pm2 monit

# View detailed info
pm2 show oto-dial-backend
```

### Nginx Commands
```bash
# Test configuration
sudo nginx -t

# Reload configuration
sudo systemctl reload nginx

# Restart Nginx
sudo systemctl restart nginx

# View logs
sudo tail -f /var/log/nginx/error.log
```

### Update Application
```bash
cd /var/www/oto-dial

# Pull latest changes
git pull origin main

# Update backend dependencies (if needed)
cd backend
npm install --production

# Rebuild frontend
cd ../frontend
npm install
npm run build

# Restart PM2
pm2 restart oto-dial-backend
```

---

## 🔐 Security Checklist

- [ ] All `.env` files are in `.gitignore`
- [ ] Strong JWT_SECRET generated (use: `openssl rand -base64 32`)
- [ ] MongoDB uses authentication
- [ ] Firewall configured (UFW)
- [ ] SSL certificate installed and auto-renewal enabled
- [ ] Nginx security headers configured
- [ ] PM2 running as non-root user
- [ ] Regular backups configured
- [ ] Environment variables validated on startup

---

## 📊 Monitoring & Logs

### PM2 Logs Location
- Backend: `/var/www/oto-dial/logs/backend-error.log`
- Backend: `/var/www/oto-dial/logs/backend-out.log`

### Nginx Logs Location
- Access: `/var/log/nginx/access.log`
- Error: `/var/log/nginx/error.log`

### View Logs
```bash
# PM2 logs (real-time)
pm2 logs oto-dial-backend --lines 100

# Nginx logs
sudo tail -f /var/log/nginx/error.log
```

---

## 🐛 Troubleshooting

### Backend won't start
```bash
# Check PM2 logs
pm2 logs oto-dial-backend --lines 50

# Check if port is in use
sudo netstat -tlnp | grep 5000

# Test backend directly
cd /var/www/oto-dial/backend
node index.js
```

### Frontend not loading
```bash
# Check if build exists
ls -la /var/www/oto-dial/frontend/dist/

# Check Nginx error logs
sudo tail -f /var/log/nginx/error.log

# Verify Nginx configuration
sudo nginx -t
```

### API calls failing
```bash
# Check CORS settings in backend/index.js
# Verify FRONTEND_URL in backend/.env matches your domain
# Check browser console for CORS errors
```

---

## 📝 Notes

- Always test in staging environment first
- Keep backups of `.env` files securely (not in git)
- Monitor PM2 logs regularly
- Set up automated backups for MongoDB
- Keep dependencies updated for security patches
