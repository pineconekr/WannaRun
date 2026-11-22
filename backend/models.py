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
    # "내 영토 지우기"를 누른 시각. 이보다 먼저 시작한 러닝은 다시 영토가 되지 않습니다.
    territory_cleared_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    expires_at: Mapped[float] = mapped_column(Float)


class TerritoryCell(Base):
    """사용자가 지나간 H3 칸(해상도 11). 사용자당 칸 하나는 한 행입니다.

    지금 누가 그 칸을 가졌는지는 TerritoryOwner가 정합니다. 이 표는 "내가 지나간 칸" 기록이라
    다른 러너에게 빼앗겨도 남고, 빼앗긴 칸 수를 세는 데 씁니다.
    """

    __tablename__ = "territory_cells"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    cell_id: Mapped[str] = mapped_column(String(15), primary_key=True)
    first_run_id: Mapped[str | None] = mapped_column(
        ForeignKey("runs.id", ondelete="SET NULL"), default=None
    )
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class TerritoryOwner(Base):
    """칸마다 지금 주인 한 명. 그 칸을 지나간 가장 최근 러닝(시작 시각, 같으면 러닝 ID 순)의 주인이 가집니다."""

    __tablename__ = "territory_owners"
    __table_args__ = (
        Index("ix_territory_owners_user", "user_id"),
        Index("ix_territory_owners_lat_lng", "lat", "lng"),
    )

    cell_id: Mapped[str] = mapped_column(String(15), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    run_id: Mapped[str | None] = mapped_column(
        ForeignKey("runs.id", ondelete="SET NULL"), default=None
    )
    # 주인을 정한 러닝의 시작 시각. 이보다 늦게 시작한 러닝만 칸을 빼앗을 수 있습니다.
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # 칸 중심 좌표. 지도 영역 조회에 씁니다.
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)


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
