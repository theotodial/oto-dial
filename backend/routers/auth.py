from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
from models import User
from schemas import UserCreate, UserResponse, UserLogin, TokenResponse
from utils import get_password_hash, verify_password, create_access_token

router = APIRouter(
    prefix="/api/auth",
    tags=["auth"]
)

# Create a separate router for /api/signup and /api/login (for frontend compatibility)
legacy_router = APIRouter(
    prefix="/api",
    tags=["auth"]
)


@router.post("/signup", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def signup(user_data: UserCreate, db: Session = Depends(get_db)):
    """
    Create a new user account.
    
    - **name**: User's full name
    - **email**: User's email address (must be unique)
    - **password**: User's password (will be hashed)
    """
    # Check if email already exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Hash the password
    hashed_password = get_password_hash(user_data.password)
    
    # Create new user
    new_user = User(
        name=user_data.name,
        email=user_data.email,
        password_hash=hashed_password
    )
    
    # Add to database
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # Return user data (without password)
    return UserResponse(
        id=new_user.id,
        name=new_user.name,
        email=new_user.email
    )


@router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin, db: Session = Depends(get_db)):
    """
    Login and get access token.
    
    - **email**: User's email address
    - **password**: User's password
    """
    # Verify user exists
    user = db.query(User).filter(User.email == credentials.email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    # Verify password
    if not verify_password(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    # Create JWT token
    access_token = create_access_token(data={"sub": user.email, "user_id": user.id})
    
    # Return token with user data
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse(
            id=user.id,
            name=user.name,
            email=user.email
        )
    )


# Legacy endpoints for frontend compatibility (/api/signup, /api/login)
@legacy_router.post("/signup", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def signup_legacy(user_data: UserCreate, db: Session = Depends(get_db)):
    """Legacy endpoint: Create a new user account."""
    # Check if email already exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Hash the password
    hashed_password = get_password_hash(user_data.password)
    
    # Create new user
    new_user = User(
        name=user_data.name,
        email=user_data.email,
        password_hash=hashed_password
    )
    
    # Add to database
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # Return user data (without password)
    return UserResponse(
        id=new_user.id,
        name=new_user.name,
        email=new_user.email
    )


@legacy_router.post("/login", response_model=TokenResponse)
async def login_legacy(credentials: UserLogin, db: Session = Depends(get_db)):
    """Legacy endpoint: Login and get access token."""
    # Verify user exists
    user = db.query(User).filter(User.email == credentials.email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    # Verify password
    if not verify_password(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    # Create JWT token
    access_token = create_access_token(data={"sub": user.email, "user_id": user.id})
    
    # Return token with user data
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse(
            id=user.id,
            name=user.name,
            email=user.email
        )
    )

