# 담당: 서솔빈
# DB 연결·세션 관리

import os
from collections.abc import Iterator
from pathlib import Path

from dotenv import load_dotenv
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

load_dotenv(Path(__file__).with_name(".env"))

database_url = os.getenv("DATABASE_URL")
if database_url and not database_url.startswith("postgresql+psycopg://"):
    raise RuntimeError("DATABASE_URL은 postgresql+psycopg:// 형식 사용.")

engine = (
    create_engine(
        database_url,
        pool_pre_ping=True,
        connect_args={"connect_timeout": 3},
    )
    if database_url
    else None
)
SessionLocal = sessionmaker(bind=engine)


def get_db() -> Iterator[Session]:
    if engine is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL 미설정")
    with SessionLocal() as session:
        yield session
