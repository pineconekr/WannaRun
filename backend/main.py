# 담당: 서솔빈
# FastAPI 앱 생성·API 연결·프론트 화면 제공

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from backend.database import engine
from backend.auth import router as auth_router
from backend.runs import router as runs_router
from backend.users import router as users_router

FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    if engine is not None:
        engine.dispose()


app = FastAPI(title="WannaRun API", lifespan=lifespan)
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(runs_router)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/health/db")
def database_health():
    if engine is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL 미설정")
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="DB 연결 실패",
        ) from None
    return {"status": "ok"}


# API 경로가 우선. 나머지 경로는 빌드된 프론트 화면 제공.
app.frontend("/", directory=FRONTEND_DIST, check_dir=False)
