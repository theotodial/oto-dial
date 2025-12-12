from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: int
    name: str
    email: str

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse


class WalletBalance(BaseModel):
    balance: float


class TopUpRequest(BaseModel):
    user_id: int
    amount: float


class BuyNumberRequest(BaseModel):
    user_id: int


class NumberResponse(BaseModel):
    id: int
    user_id: int
    number: str
    country: str
    created_at: datetime

    class Config:
        from_attributes = True


class BuyNumberResponse(BaseModel):
    number: str


class CallLogCreate(BaseModel):
    user_id: int
    from_number: str
    to_number: str
    transcript: Optional[str] = None


class CallLogResponse(BaseModel):
    id: int
    user_id: int
    from_number: str
    to_number: str
    transcript: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class ChatMessageCreate(BaseModel):
    user_id: int
    message: str


class ChatMessageResponse(BaseModel):
    id: int
    user_id: int
    message: str
    sender: str
    created_at: datetime

    class Config:
        from_attributes = True

