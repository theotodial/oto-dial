# OTO-DIAL

A full-stack application for phone number management, calling, and chat functionality.

## Quick Start

### Prerequisites

- Node.js (v16 or higher)
- npm (comes with Node.js)

### Installation

1. **Clone the repository** (if applicable)

2. **Install backend dependencies:**
```bash
cd backend
npm install
```

3. **Install frontend dependencies:**
```bash
cd ../frontend
npm install
```

### Running the Application

#### Local Development Commands

Run both frontend and backend side by side using the root-level scripts:

| Command | Description |
|--------|-------------|
| `npm run dev:backend` | Starts backend server on `http://localhost:5000` |
| `npm run dev:frontend` | Starts frontend dev server on `http://localhost:3000` |
| `npm run dev` | Runs both backend and frontend concurrently |

**Quick Start:**
```bash
# Install root dependencies (includes concurrently)
npm install

# Run both frontend and backend together
npm run dev
```

**Run Individually:**
```bash
# Backend only (in separate terminal)
npm run dev:backend

# Frontend only (in separate terminal)
npm run dev:frontend
```

For detailed local development setup, see [infra/README.dev.md](./infra/README.dev.md)

For deployment instructions (Vercel + Render/Railway), see [infra/README.deploy.md](./infra/README.deploy.md)

## Environment Variables

### Backend

Create a `.env` file in the `backend/` directory:

```env
PORT=5000
```

**Default Values:**
- `PORT`: 5000 (server port)

**Optional:** Copy `.env.example` if available:
```bash
cd backend
cp .env.example .env
```

### Frontend

Create a `.env` file in the `frontend/` directory:

```env
VITE_API_URL=http://localhost:5000
```

**Note:** The frontend API helper (`src/api.js`) uses this environment variable to connect to the backend. Make sure to create this file before running the frontend.

**Default Value:**
- `VITE_API_URL`: `http://localhost:5000` (backend API URL)

To change the backend URL, update the `VITE_API_URL` value in `.env` or modify `vite.config.js` proxy target.

## Project Structure

```
oto-dial/
├── backend/          # Node.js + Express API
│   ├── src/          # Source code (routes, controllers, models, utils)
│   ├── index.js      # Server entry point
│   └── package.json  # Backend dependencies
├── frontend/         # React + Vite application
│   ├── src/          # React source code
│   │   ├── pages/    # Page components
│   │   ├── components/ # Reusable components
│   │   └── App.jsx   # Main app component
│   └── package.json  # Frontend dependencies
└── infra/            # Infrastructure and setup docs
    ├── README.dev.md # Local development guide
    ├── README.deploy.md # Deployment guide
    └── render.yaml   # Render service configuration
```

## Features

- **Authentication:** Sign up and login
- **Wallet:** Balance management and top-up
- **Numbers:** Purchase and manage phone numbers
- **Dialer:** Make calls and view call history
- **Chat:** Real-time chat with bot echo responses

## API Endpoints

### Authentication
- `POST /api/auth/signup` - Create new user
- `POST /api/auth/login` - User login

### Wallet
- `GET /api/wallet/:email` - Get wallet balance
- `POST /api/wallet/topup` - Add funds to wallet

### Numbers
- `POST /api/numbers/buy` - Purchase a phone number
- `GET /api/numbers/:email` - List user's numbers

### Calls
- `POST /api/call` - Create call log
- `GET /api/calls/:email` - Get user's call history

### Chat
- `GET /api/chat` - Get all messages
- `POST /api/chat` - Send a message

## Tech Stack

### Backend
- Node.js
- Express.js
- In-memory storage (no database)

### Frontend
- React 18
- React Router
- Vite
- JavaScript (no TypeScript)

## Development & Deployment

- **Local Development:** See [infra/README.dev.md](./infra/README.dev.md) for setup and troubleshooting
- **Production Deployment:** See [infra/README.deploy.md](./infra/README.deploy.md) for deploying to Vercel (frontend) and Render/Railway (backend)

## License

ISC

