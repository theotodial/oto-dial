# OTO-DIAL Backend (FastAPI)

FastAPI backend for the OTO-DIAL VoIP/SMS platform.

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Create a `.env` file (copy from `.env.example`):
```bash
cp .env.example .env
```

3. Update `.env` with your configuration:
- `DATABASE_URL`: SQLite database path
- `SECRET_KEY`: Secret key for JWT tokens (change in production)

## Running the Server

### Development mode (with auto-reload):
```bash
uvicorn main:app --reload --port 8000
```

### Production mode:
```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

## API Documentation

Once the server is running, visit:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Project Structure

```
backend/
├── main.py              # FastAPI application entry point
├── database.py          # SQLAlchemy database configuration
├── models.py            # SQLAlchemy models
├── schemas.py           # Pydantic schemas
├── utils.py             # Utility functions (password hashing, JWT)
├── routers/             # API route handlers
│   ├── auth.py          # Authentication routes
│   ├── wallet.py        # Wallet routes
│   ├── numbers.py       # Phone number routes
│   ├── calls.py         # Call routes
│   └── chat.py          # Chat routes
└── requirements.txt     # Python dependencies
```
