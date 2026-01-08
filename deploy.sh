#!/bin/bash

# OTO DIAL - Production Deployment Script
# Usage: ./deploy.sh

set -e  # Exit on error

echo "🚀 Starting OTO DIAL Deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
   echo -e "${RED}❌ Please do not run as root${NC}"
   exit 1
fi

# Configuration
APP_DIR="/var/www/oto-dial"
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"

# Check if directories exist
if [ ! -d "$BACKEND_DIR" ]; then
    echo -e "${RED}❌ Backend directory not found: $BACKEND_DIR${NC}"
    exit 1
fi

if [ ! -d "$FRONTEND_DIR" ]; then
    echo -e "${RED}❌ Frontend directory not found: $FRONTEND_DIR${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Directories found${NC}"

# Step 1: Pull latest code
echo -e "${YELLOW}📥 Pulling latest code...${NC}"
cd $APP_DIR
git pull origin main || echo "⚠️  Git pull failed or not a git repo"

# Step 2: Install backend dependencies
echo -e "${YELLOW}📦 Installing backend dependencies...${NC}"
cd $BACKEND_DIR
npm install --production --no-audit

# Step 3: Install frontend dependencies and build
echo -e "${YELLOW}📦 Installing frontend dependencies...${NC}"
cd $FRONTEND_DIR
npm install --no-audit
echo -e "${YELLOW}🔨 Building frontend...${NC}"
npm run build

# Step 4: Validate build
if [ ! -f "$FRONTEND_DIR/dist/index.html" ]; then
    echo -e "${RED}❌ Frontend build failed - index.html not found${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Frontend build successful${NC}"

# Step 5: Restart PM2
echo -e "${YELLOW}🔄 Restarting PM2 application...${NC}"
cd $APP_DIR
pm2 restart oto-dial-backend || pm2 start ecosystem.config.js

# Step 6: Save PM2 process list
pm2 save

# Step 7: Check PM2 status
echo -e "${YELLOW}📊 PM2 Status:${NC}"
pm2 status

# Step 8: Test backend health
echo -e "${YELLOW}🏥 Testing backend health...${NC}"
sleep 3
HEALTH_CHECK=$(curl -s http://localhost:5000/api/health || echo "FAILED")
if [[ $HEALTH_CHECK == *"success"* ]]; then
    echo -e "${GREEN}✅ Backend health check passed${NC}"
else
    echo -e "${RED}❌ Backend health check failed${NC}"
    echo "Check logs: pm2 logs oto-dial-backend"
fi

# Step 9: Reload Nginx
echo -e "${YELLOW}🔄 Reloading Nginx...${NC}"
sudo nginx -t && sudo systemctl reload nginx || echo "⚠️  Nginx reload failed"

echo -e "${GREEN}✅ Deployment completed!${NC}"
echo -e "${YELLOW}📋 Next steps:${NC}"
echo "1. Check application: https://yourdomain.com"
echo "2. Monitor logs: pm2 logs oto-dial-backend"
echo "3. Check status: pm2 status"

