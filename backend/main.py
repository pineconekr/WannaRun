# 담당: 서솔빈
# FastAPI 앱 생성·API 연결

from contextlib import asynccontextmanager
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from backend.database import engine
from backend.auth import router as auth_router
from backend.users import router as users_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    if engine is not None:
        engine.dispose()


app = FastAPI(title="WannaRun API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
        ).split(",")
        if origin.strip()
    ],
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["Authorization", "Content-Type"],
)
app.include_router(auth_router)
app.include_router(users_router)


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
