# 담당: 서솔빈
# 내 정보 조회

from fastapi import APIRouter, HTTPException

from backend.auth import CurrentSession, Db
from backend.models import User
from backend.schemas import UserResponse

router = APIRouter(prefix="/api/users", tags=["사용자"])


def current_user(db: Db, session: CurrentSession) -> User:
    user = db.get(User, session.user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="로그인 필요")
    return user


@router.get("/me", response_model=UserResponse)
def get_me(db: Db, session: CurrentSession):
    return current_user(db, session)
