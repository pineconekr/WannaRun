# 담당: 서솔빈
# 사용자·로그인 세션·러닝 기록

import uuid
from datetime import datetime

from sqlalchemy import JSON, CheckConstraint, DateTime, Float, ForeignKey, Index, Integer, String, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    username: Mapped[str] = mapped_column(String(20), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    expires_at: Mapped[float] = mapped_column(Float)


class Run(Base):
    __tablename__ = "runs"
    __table_args__ = (
        CheckConstraint("source IN ('gps', 'demo', 'legacy')", name="ck_runs_source"),
        Index("ix_runs_owner_started", "user_id", "started_at", "id"),
        Index(
            "ix_runs_rankable_started",
            "started_at",
            "user_id",
            postgresql_where=text("source = 'gps' AND distance_m > 0 AND duration_s > 0"),
            sqlite_where=text("source = 'gps' AND distance_m > 0 AND duration_s > 0"),
        ),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    distance_m: Mapped[float] = mapped_column(Float)
    duration_s: Mapped[int] = mapped_column(Integer)
    path: Mapped[list] = mapped_column(JSON)
    title: Mapped[str] = mapped_column(
        String(120), default="오늘의 러닝", server_default="오늘의 러닝"
    )
    note: Mapped[str] = mapped_column(String(2000), default="", server_default="")
    # Unclassified direct SQL inserts stay unranked; API/ORM creates default to gps.
    source: Mapped[str] = mapped_column(
        String(6), default="gps", server_default="legacy"
    )
    speed_samples: Mapped[list] = mapped_column(
        JSON, default=list, server_default=text("'[]'")
    )
