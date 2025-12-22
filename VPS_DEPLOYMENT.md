# VPS Deployment Guide

This guide covers deploying OTO-DIAL to a Linux VPS using Node.js and PM2.

## Prerequisites

- Linux VPS (Ubuntu/Debian recommended)
- Node.js 18+ installed
- npm installed
- PM2 installed globally: `npm install -g pm2`
- Git installed (for cloning repository)

## Server Setup

### 1. Install Node.js (if not already installed)

```bash
# Using NodeSource repository (Ubuntu/Debian)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version
npm --version
```

### 2. Install PM2

```bash
sudo npm install -g pm2
```

### 3. Clone Repository

```bash
cd /var/www  # or your preferred directory
git clone <your-repo-url> oto-dial
cd oto-dial
```

## Environment Variables

### Backend Environment Variables

Create `backend/.env` file:

```env
PORT=5000
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
# Add any other backend environment variables
```

### Frontend Environment Variables

Create `frontend/.env.production` file:

```env
VITE_API_URL=http://your-vps-ip:5000
# Or if using domain: VITE_API_URL=https://api.yourdomain.com
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Build and Deploy

### 1. Install Dependencies

```bash
# Install all dependencies (root, backend, frontend)
npm run install:all
```

### 2. Build Frontend

```bash
npm run build:frontend
```

This creates the production build in `frontend/dist/`.

### 3. Start with PM2

```bash
# Start both backend and frontend
pm2 start ecosystem.config.js

# Or start individually:
pm2 start ecosystem.config.js --only oto-dial-backend
pm2 start ecosystem.config.js --only oto-dial-frontend
```

### 4. Save PM2 Configuration

```bash
pm2 save
pm2 startup
# Follow the instructions to enable PM2 on system startup
```

## PM2 Management Commands

```bash
# View status
pm2 status

# View logs
pm2 logs
pm2 logs oto-dial-backend
pm2 logs oto-dial-frontend

# Restart apps
pm2 restart ecosystem.config.js
pm2 restart oto-dial-backend
pm2 restart oto-dial-frontend

# Stop apps
pm2 stop ecosystem.config.js

# Delete apps
pm2 delete ecosystem.config.js

# Monitor
pm2 monit
```

## Port Configuration

- **Backend**: Runs on port 5000 (configurable via `PORT` env variable)
- **Frontend**: Runs on port 3000 (configurable via `PORT` env variable)

To change ports, update `ecosystem.config.js` or set environment variables:

```bash
# Set custom ports
export PORT=8080  # for backend
export PORT=80    # for frontend (requires root or use reverse proxy)
```

## Reverse Proxy Setup (Recommended)

For production, use Nginx as a reverse proxy:

### Install Nginx

```bash
sudo apt update
sudo apt install nginx
```

### Nginx Configuration

Create `/etc/nginx/sites-available/oto-dial`:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/oto-dial /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## SSL Certificate (Optional but Recommended)

Use Let's Encrypt with Certbot:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

## Firewall Configuration

```bash
# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# If not using reverse proxy, allow application ports
sudo ufw allow 3000/tcp
sudo ufw allow 5000/tcp

# Enable firewall
sudo ufw enable
```

## Manual Steps Required on VPS

1. **Install Node.js 18+** (if not pre-installed)
2. **Install PM2 globally**: `npm install -g pm2`
3. **Clone repository** to VPS
4. **Set up environment variables**:
   - Create `backend/.env` with backend configuration
   - Create `frontend/.env.production` with frontend configuration
5. **Install dependencies**: `npm run install:all`
6. **Build frontend**: `npm run build:frontend`
7. **Start applications**: `pm2 start ecosystem.config.js`
8. **Save PM2 configuration**: `pm2 save && pm2 startup`
9. **Configure reverse proxy** (Nginx recommended)
10. **Set up SSL certificate** (Let's Encrypt recommended)
11. **Configure firewall** (UFW)

## Troubleshooting

### Check if apps are running

```bash
pm2 status
pm2 logs
```

### Check port availability

```bash
sudo netstat -tulpn | grep :5000
sudo netstat -tulpn | grep :3000
```

### View application logs

```bash
# PM2 logs
pm2 logs oto-dial-backend
pm2 logs oto-dial-frontend

# Or check log files
tail -f logs/backend-out.log
tail -f logs/frontend-out.log
```

### Restart after code changes

```bash
# After pulling updates
git pull
npm run build:frontend
pm2 restart ecosystem.config.js
```

## Production Checklist

- [ ] Node.js 18+ installed
- [ ] PM2 installed globally
- [ ] Repository cloned
- [ ] Environment variables configured
- [ ] Dependencies installed
- [ ] Frontend built (`npm run build:frontend`)
- [ ] PM2 processes running
- [ ] PM2 startup configured
- [ ] Reverse proxy configured (Nginx)
- [ ] SSL certificate installed
- [ ] Firewall configured
- [ ] Applications accessible via domain/IP

