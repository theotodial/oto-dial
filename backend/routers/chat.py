from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
from models import ChatMessage, User
from schemas import ChatMessageCreate, ChatMessageResponse

router = APIRouter(
    prefix="/api/chat",
    tags=["chat"]
)


@router.post("", response_model=ChatMessageResponse, status_code=status.HTTP_201_CREATED)
async def send_message(message_data: ChatMessageCreate, db: Session = Depends(get_db)):
    """
    Save a user message and return an AI reply.
    
    - **user_id**: The ID of the user sending the message
    - **message**: The message text
    """
    # Verify user exists
    user = db.query(User).filter(User.id == message_data.user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Save user message
    user_message = ChatMessage(
        user_id=message_data.user_id,
        message=message_data.message,
        sender="user"
    )
    
    db.add(user_message)
    db.flush()  # Flush to get the ID
    
    # Create AI reply
    ai_message = ChatMessage(
        user_id=message_data.user_id,
        message="This is an AI placeholder reply",
        sender="ai"
    )
    
    db.add(ai_message)
    db.commit()
    db.refresh(ai_message)
    
    # Return AI reply
    return ChatMessageResponse(
        id=ai_message.id,
        user_id=ai_message.user_id,
        message=ai_message.message,
        sender=ai_message.sender,
        created_at=ai_message.created_at
    )


@router.get("/{user_id}", response_model=list[ChatMessageResponse])
async def get_chat_history(user_id: int, db: Session = Depends(get_db)):
    """
    Get chat history for a user.
    
    - **user_id**: The ID of the user
    """
    # Verify user exists
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    messages = db.query(ChatMessage).filter(
        ChatMessage.user_id == user_id
    ).order_by(ChatMessage.created_at.asc()).all()
    
    return messages

