# 🚀 Quick Start Deployment Guide

This is a simplified guide for deploying OTO DIAL to Hostinger VPS.

## Prerequisites Checklist

✅ Domain name pointing to your VPS IP  
✅ Stripe production keys  
✅ Telnyx production API key  
✅ Google OAuth credentials (optional)  
✅ MongoDB database (Atlas recommended)

## One-Time VPS Setup

```bash
# 1. Connect to VPS
ssh root@your-vps-ip

# 2. Update system
sudo apt update && sudo apt upgrade -y

# 3. Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 4. Install PM2
sudo npm install -g pm2
pm2 startup systemd

# 5. Install Nginx
sudo apt install -y nginx certbot python3-certbot-nginx

# 6. Install MongoDB (optional - or use Atlas)
# Skip if using MongoDB Atlas
```

## Application Deployment

```bash
# 1. Create app directory
sudo mkdir -p /var/www/oto-dial
sudo chown -R $USER:$USER /var/www/oto-dial
cd /var/www/oto-dial

# 2. Clone repository
git clone https://github.com/yourusername/oto-dial.git .

# 3. Setup backend environment
cd backend
cp .env.example .env
nano .env  # Fill in your production values

# 4. Setup frontend environment  
cd ../frontend
cp .env.example .env
nano .env  # Set VITE_API_URL=https://yourdomain.com

# 5. Install dependencies and build
cd ../backend
npm install --production

cd ../frontend
npm install
npm run build

# 6. Start with PM2
cd ..
mkdir -p logs
pm2 start ecosystem.config.js
pm2 save

# 7. Configure Nginx
sudo cp nginx.conf /etc/nginx/sites-available/oto-dial
sudo nano /etc/nginx/sites-available/oto-dial  # Replace yourdomain.com
sudo ln -s /etc/nginx/sites-available/oto-dial /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

# 8. Setup SSL
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# 9. Configure firewall
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## Verify Deployment

```bash
# Check backend health
curl https://yourdomain.com/api/health

# Check PM2
pm2 status
pm2 logs oto-dial-backend

# Visit your site
# https://yourdomain.com
```

## Update Application

Use the provided deploy script:

```bash
cd /var/www/oto-dial
chmod +x deploy.sh
./deploy.sh
```

Or manually:
```bash
cd /var/www/oto-dial
git pull
cd backend && npm install --production
cd ../frontend && npm install && npm run build
pm2 restart oto-dial-backend
```

## Important URLs to Configure

1. **Google OAuth Callback**: `https://yourdomain.com/api/auth/google/callback`
2. **Stripe Webhook**: `https://yourdomain.com/api/webhooks/stripe`
3. **Telnyx Voice Webhook**: `https://yourdomain.com/api/webhooks/telnyx/voice`
4. **Telnyx SMS Webhook**: `https://yourdomain.com/api/webhooks/telnyx/sms`

## Troubleshooting

**Backend not starting?**
```bash
pm2 logs oto-dial-backend
# Check for missing environment variables
```

**502 Bad Gateway?**
```bash
# Check if backend is running
pm2 status
# Check if port 5000 is listening
sudo netstat -tlnp | grep 5000
```

**CORS errors?**
- Verify `FRONTEND_URL` in backend `.env` matches your domain
- Check browser console for exact error

For detailed troubleshooting, see [DEPLOYMENT.md](./DEPLOYMENT.md)

