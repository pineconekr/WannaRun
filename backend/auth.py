# 담당: 서솔빈
# 회원가입·로그인·로그아웃

import hashlib
import secrets
import time
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import AuthSession, User
from backend.schemas import LoginRequest, SignupRequest, TokenResponse, UserResponse

router = APIRouter(prefix="/api/auth", tags=["인증"])
password_hasher = PasswordHash.recommended()
bearer = HTTPBearer(auto_error=False)
SESSION_SECONDS = 24 * 60 * 60
Db = Annotated[Session, Depends(get_db)]
Credentials = Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def require_session(db: Db, credentials: Credentials) -> AuthSession:
    if credentials is not None:
        session = db.get(AuthSession, token_digest(credentials.credentials))
        if session is not None and session.expires_at > time.time():
            return session
    raise HTTPException(
        status_code=401,
        detail="로그인 필요",
        headers={"WWW-Authenticate": "Bearer"},
    )


CurrentSession = Annotated[AuthSession, Depends(require_session)]


@router.post("/signup", response_model=UserResponse, status_code=201)
def signup(data: SignupRequest, db: Db):
    user = User(
        username=data.username,
        password_hash=password_hasher.hash(data.password.get_secret_value()),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="이미 사용 중인 아이디") from None
    db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, db: Db):
    user = db.scalar(select(User).where(User.username == data.username))
    if user is None or not password_hasher.verify(
        data.password.get_secret_value(), user.password_hash
    ):
        raise HTTPException(status_code=401, detail="아이디 또는 비밀번호 확인")
    token = secrets.token_urlsafe(32)
    db.add(AuthSession(
        token_hash=token_digest(token),
        user_id=user.id,
        expires_at=time.time() + SESSION_SECONDS,
    ))
    db.commit()
    return TokenResponse(access_token=token, expires_in=SESSION_SECONDS)


@router.post("/logout", status_code=204)
def logout(db: Db, session: CurrentSession):
    db.delete(session)
    db.commit()
    return Response(status_code=204)
