from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
from models import Number, User
from schemas import BuyNumberRequest, BuyNumberResponse, NumberResponse
import random

router = APIRouter(
    prefix="/api/numbers",
    tags=["numbers"]
)


def generate_phone_number(country: str = "US") -> str:
    """
    Generate a random phone number (10-12 digits).
    Default format for US: +1XXXXXXXXXX
    """
    # Generate random digits (10-12 digits total)
    num_digits = random.randint(10, 12)
    random_digits = ''.join([str(random.randint(0, 9)) for _ in range(num_digits)])
    
    # Country code mapping
    country_codes = {
        "US": "+1",
        "UK": "+44",
        "CA": "+1",
        "AU": "+61",
        "DE": "+49"
    }
    
    prefix = country_codes.get(country, "+1")
    return f"{prefix}{random_digits}"


@router.post("/buy", response_model=BuyNumberResponse)
async def buy_number(request: BuyNumberRequest, db: Session = Depends(get_db)):
    """
    Buy a phone number for a user.
    
    - **user_id**: The ID of the user buying the number
    """
    # Verify user exists
    user = db.query(User).filter(User.id == request.user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Generate unique phone number
    max_attempts = 10
    for _ in range(max_attempts):
        phone_number = generate_phone_number()
        existing_number = db.query(Number).filter(Number.number == phone_number).first()
        if not existing_number:
            break
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate unique phone number"
        )
    
    # Create number record
    new_number = Number(
        user_id=request.user_id,
        number=phone_number,
        country="US"  # Default country, can be made configurable
    )
    
    db.add(new_number)
    db.commit()
    db.refresh(new_number)
    
    return BuyNumberResponse(number=phone_number)


@router.get("/{user_id}", response_model=list[NumberResponse])
async def get_user_numbers(user_id: int, db: Session = Depends(get_db)):
    """
    Get all phone numbers for a user.
    
    - **user_id**: The ID of the user
    """
    numbers = db.query(Number).filter(Number.user_id == user_id).all()
    return numbers

