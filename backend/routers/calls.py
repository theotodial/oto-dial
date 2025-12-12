from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
from models import CallLog, User
from schemas import CallLogCreate, CallLogResponse

router = APIRouter(
    prefix="/api/calls",
    tags=["calls"]
)


@router.post("", response_model=CallLogResponse, status_code=status.HTTP_201_CREATED)
async def create_call_log(call_log: CallLogCreate, db: Session = Depends(get_db)):
    """
    Save a call log entry.
    
    - **user_id**: The ID of the user making/receiving the call
    - **from_number**: The phone number making the call
    - **to_number**: The phone number receiving the call
    - **transcript**: Optional transcript of the call
    """
    # Verify user exists
    user = db.query(User).filter(User.id == call_log.user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Create call log entry
    new_call_log = CallLog(
        user_id=call_log.user_id,
        from_number=call_log.from_number,
        to_number=call_log.to_number,
        transcript=call_log.transcript
    )
    
    db.add(new_call_log)
    db.commit()
    db.refresh(new_call_log)
    
    return CallLogResponse(
        id=new_call_log.id,
        user_id=new_call_log.user_id,
        from_number=new_call_log.from_number,
        to_number=new_call_log.to_number,
        transcript=new_call_log.transcript,
        created_at=new_call_log.created_at
    )


@router.get("/{user_id}", response_model=list[CallLogResponse])
async def get_user_call_logs(user_id: int, db: Session = Depends(get_db)):
    """
    Get all call logs for a user.
    
    - **user_id**: The ID of the user
    """
    # Verify user exists
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    call_logs = db.query(CallLog).filter(CallLog.user_id == user_id).order_by(CallLog.created_at.desc()).all()
    return call_logs

