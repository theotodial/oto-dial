# OTO DIAL - Full-Stack VoIP/SMS Platform

A modern, production-ready VoIP and SMS platform built with React, Node.js, Express, and MongoDB.

## 🚀 Features

- **User Authentication**: Email/password and Google OAuth
- **Phone Numbers**: Purchase and manage phone numbers via Telnyx
- **Voice Calls**: Make and receive calls
- **SMS/Messaging**: Send and receive SMS messages
- **Subscriptions**: Stripe-powered subscription management
- **Dashboard**: Comprehensive user dashboard
- **Mobile Responsive**: Works on desktop, tablet, and mobile

## 📋 Prerequisites

- Node.js 18+ 
- MongoDB (local or MongoDB Atlas)
- Stripe account
- Telnyx account
- Google OAuth credentials (optional)

## 🛠️ Development Setup

### 1. Clone Repository

```bash
git clone https://github.com/yourusername/oto-dial.git
cd oto-dial
```

### 2. Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your configuration
npm run dev
```

### 3. Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env
# Edit .env with your configuration
npm run dev
```

### 4. Environment Variables

See `backend/.env.example` and `frontend/.env.example` for required variables.

## 📦 Production Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete deployment guide.

Quick deployment:
1. Follow [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md)
2. Use `deploy.sh` script for automated deployment
3. Configure Nginx using `nginx.conf`

## 🗂️ Project Structure

```
oto-dial/
├── backend/           # Node.js/Express backend
│   ├── src/
│   │   ├── routes/    # API routes
│   │   ├── models/    # MongoDB models
│   │   ├── middleware/# Auth & validation middleware
│   │   └── services/  # Stripe, Telnyx services
│   └── index.js       # Entry point
├── frontend/          # React frontend
│   ├── src/
│   │   ├── pages/     # Page components
│   │   ├── components/# Reusable components
│   │   ├── context/   # React contexts
│   │   └── api.js     # API client
│   └── vite.config.js
├── nginx.conf         # Nginx configuration
├── ecosystem.config.js# PM2 configuration
└── deploy.sh          # Deployment script
```

## 🔐 Security

- JWT authentication
- Password hashing with bcrypt
- CORS configuration
- Environment variable validation
- Input sanitization
- Rate limiting (recommended)

## 📚 API Documentation

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/google` - Google OAuth

### Subscriptions
- `GET /api/subscription` - Get user subscription
- `POST /api/stripe/checkout` - Create checkout session

### Phone Numbers
- `GET /api/numbers` - Get user numbers
- `POST /api/numbers/buy` - Purchase number

### Calls
- `POST /api/calls` - Initiate call
- `GET /api/calls` - Get call history

### SMS
- `POST /api/sms/send` - Send SMS
- `GET /api/messages` - Get message history

## 🧪 Testing

```bash
# Backend tests (if configured)
cd backend
npm test

# Frontend tests (if configured)
cd frontend
npm test
```

## 📝 License

ISC

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Create Pull Request

## 📞 Support

For issues and questions, please open an issue on GitHub.

---

**Built with ❤️ for reliable communication**
