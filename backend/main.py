from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers.auth import router as auth_router, legacy_router as auth_legacy_router
from routers.wallet import router as wallet_router
from routers.numbers import router as numbers_router
from routers.calls import router as calls_router
from routers.chat import router as chat_router
from database import engine, Base
import models  # Import models to ensure tables are created

# Create database tables
Base.metadata.create_all(bind=engine)

# Create FastAPI app
app = FastAPI(
    title="OTO-DIAL API",
    description="Backend API for OTO-DIAL VoIP/SMS platform",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite default port
        "http://localhost:3000",  # Alternative frontend port
        "http://localhost:5174",  # Alternative Vite port
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router)  # /api/auth/*
app.include_router(auth_legacy_router)  # /api/signup, /api/login (for frontend compatibility)
app.include_router(wallet_router)
app.include_router(numbers_router)
app.include_router(calls_router)
app.include_router(chat_router)

# Root endpoint
@app.get("/")
async def root():
    return {"status": "OK", "message": "OTO-DIAL API is running"}

# Health check
@app.get("/health")
async def health_check():
    return {"status": "healthy"}
