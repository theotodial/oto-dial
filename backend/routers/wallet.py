from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
from models import Wallet
from schemas import WalletBalance, TopUpRequest

router = APIRouter(
    prefix="/api/wallet",
    tags=["wallet"]
)


@router.get("/{user_id}", response_model=WalletBalance)
async def get_wallet(user_id: int, db: Session = Depends(get_db)):
    """
    Get wallet balance for a user.
    
    - **user_id**: The ID of the user
    """
    wallet = db.query(Wallet).filter(Wallet.user_id == user_id).first()
    
    if not wallet:
        # Create wallet if it doesn't exist
        wallet = Wallet(user_id=user_id, balance=0)
        db.add(wallet)
        db.commit()
        db.refresh(wallet)
    
    return WalletBalance(balance=float(wallet.balance))


@router.post("/topup", response_model=WalletBalance)
async def topup_wallet(request: TopUpRequest, db: Session = Depends(get_db)):
    """
    Top up wallet balance.
    
    - **user_id**: The ID of the user
    - **amount**: The amount to add to the wallet
    """
    if request.amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Amount must be greater than 0"
        )
    
    wallet = db.query(Wallet).filter(Wallet.user_id == request.user_id).first()
    
    if not wallet:
        # Create wallet if it doesn't exist
        wallet = Wallet(user_id=request.user_id, balance=request.amount)
        db.add(wallet)
    else:
        # Increase balance
        wallet.balance += request.amount
    
    db.commit()
    db.refresh(wallet)
    
    return WalletBalance(balance=float(wallet.balance))

