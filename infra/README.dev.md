# Local Development Setup (Without Docker)

This guide explains how to run the OTO-DIAL application locally without Docker.

## Prerequisites

- **Node.js** (v16 or higher recommended)
- **npm** (comes with Node.js)

## Setup Steps

### 1. Install Backend Dependencies

Navigate to the backend directory and install dependencies:

```bash
cd backend
npm install
```

### 2. Install Frontend Dependencies

Navigate to the frontend directory and install dependencies:

```bash
cd ../frontend
npm install
```

### 3. Configure Environment Variables

Backend environment variables are optional (defaults are provided). If you want to customize:

```bash
cd ../backend
cp .env.example .env  # If .env.example exists
```

Edit `.env` file if needed (default PORT is 5000).

## Running the Application

### Option 1: Run Backend and Frontend Separately (Recommended for Development)

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```
Backend will run on `http://localhost:5000`

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```
Frontend will run on `http://localhost:3000`

### Option 2: Run Backend and Frontend Concurrently

If you have `concurrently` installed globally or want to use npm scripts:

**Install concurrently globally (one-time):**
```bash
npm install -g concurrently
```

**Then from the root directory, run:**
```bash
concurrently "cd backend && npm run dev" "cd frontend && npm run dev"
```

Or create a package.json in the root with a script (see below).

### Option 3: Using npm Scripts from Root

Create a `package.json` in the project root:

```json
{
  "name": "oto-dial",
  "scripts": {
    "dev": "concurrently \"npm run dev --prefix backend\" \"npm run dev --prefix frontend\"",
    "install-all": "npm install --prefix backend && npm install --prefix frontend"
  },
  "devDependencies": {
    "concurrently": "^8.2.2"
  }
}
```

Then run:
```bash
npm install
npm run dev
```

## Development URLs

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:5000
- **Health Check:** http://localhost:5000/

## Development Notes

- Backend uses **nodemon** for auto-reload on file changes
- Frontend uses **Vite** with hot module replacement
- Data is stored in-memory (resets on server restart)
- No database required for development

## Troubleshooting

### Port Already in Use

If port 5000 or 3000 is already in use:

1. **Backend:** Set `PORT` in `.env` file or environment variable
2. **Frontend:** Update `vite.config.js` server port

### CORS Issues

Backend has CORS enabled for `localhost:3000` by default. If you change frontend port, update backend CORS settings.

### Dependencies Issues

If you encounter dependency errors:
```bash
# Remove node_modules and reinstall
cd backend
rm -rf node_modules package-lock.json
npm install

cd ../frontend
rm -rf node_modules package-lock.json
npm install
```

## Testing the Setup

1. Start backend: `cd backend && npm run dev`
2. Start frontend: `cd frontend && npm run dev`
3. Visit http://localhost:3000
4. You should see the homepage with "API OK" if backend is running

