from datetime import datetime, timezone
from uuid import uuid4

import pytest
from sqlalchemy import (
    JSON, Column, DateTime, Float, ForeignKey, Integer, MetaData, String, Table,
    create_engine, inspect, select,
)
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.migrate import migrate
from backend.models import AuthSession, Run, User


def test_legacy_migration_preserves_accounts_sessions_and_records_and_is_rerunnable():
    engine = create_engine("sqlite://")
    old = MetaData()
    users = Table(
        "users", old,
        Column("id", String(36), primary_key=True),
        Column("username", String(20), unique=True, nullable=False),
        Column("password_hash", String(255), nullable=False),
    )
    sessions = Table(
        "auth_sessions", old,
        Column("token_hash", String(64), primary_key=True),
        Column("user_id", ForeignKey("users.id"), nullable=False, index=True),
        Column("expires_at", Float, nullable=False),
    )
    runs = Table(
        "runs", old,
        Column("id", String(36), primary_key=True),
        Column("user_id", ForeignKey("users.id"), nullable=False, index=True),
        Column("started_at", DateTime(timezone=True), nullable=False),
        Column("ended_at", DateTime(timezone=True), nullable=False),
        Column("distance_m", Float, nullable=False),
        Column("duration_s", Integer, nullable=False),
        Column("path", JSON, nullable=False),
    )
    user_id, run_id = str(uuid4()), str(uuid4())
    start = datetime(2026, 10, 1, 9, tzinfo=timezone.utc)
    end = datetime(2026, 10, 1, 9, 5, tzinfo=timezone.utc)
    path = [[35.1, 129.1], [35.2, 129.2]]
    try:
        old.create_all(engine)
        with engine.begin() as connection:
            connection.execute(users.insert().values(
                id=user_id, username="existing_runner", password_hash="existing-password-hash",
            ))
            connection.execute(sessions.insert().values(
                token_hash="a" * 64, user_id=user_id, expires_at=9999999999,
            ))
            connection.execute(runs.insert().values(
                id=run_id, user_id=user_id, started_at=start, ended_at=end,
                distance_m=1000, duration_s=300, path=path,
            ))
        migrate(engine)
        migrate(engine)
        with Session(engine) as db:
            account = db.get(User, user_id)
            assert account.username == "existing_runner"
            assert account.password_hash == "existing-password-hash"
            session = db.get(AuthSession, "a" * 64)
            assert session.user_id == user_id and session.expires_at == 9999999999
            run = db.get(Run, run_id)
            assert run.source == "legacy"
            assert run.title == "오늘의 러닝" and run.note == "" and run.speed_samples == []
            assert run.path == path and run.distance_m == 1000 and run.duration_s == 300
            assert run.started_at == start.replace(tzinfo=None)
            assert run.ended_at == end.replace(tzinfo=None)
            # ORM/API writes are gps; unclassified direct SQL writers remain legacy.
            new = Run(user_id=user_id, started_at=start, ended_at=end,
                      distance_m=100, duration_s=30, path=[])
            db.add(new)
            db.flush()
            assert new.source == "gps"
            new.title = "유지할 새 제목"
            new.note = "메모"
            new.speed_samples = [{"elapsed_s": 1.5, "mps": 2.5}]
            new_id = new.id
            db.commit()
        raw_id = str(uuid4())
        with engine.begin() as connection:
            # The old table object deliberately omits all new fields.
            connection.execute(runs.insert().values(
                id=raw_id, user_id=user_id, started_at=start, ended_at=end,
                distance_m=50, duration_s=10, path=[],
            ))
        migrate(engine)
        with Session(engine) as db:
            assert len(db.scalars(select(User)).all()) == 1
            assert len(db.scalars(select(AuthSession)).all()) == 1
            assert len(db.scalars(select(Run)).all()) == 3
            assert db.get(Run, run_id).source == "legacy"
            assert db.get(Run, raw_id).source == "legacy"
            new = db.get(Run, new_id)
            assert new.source == "gps" and new.title == "유지할 새 제목" and new.note == "메모"
            assert new.speed_samples == [{"elapsed_s": 1.5, "mps": 2.5}]
        inspector = inspect(engine)
        columns = {column["name"]: column for column in inspector.get_columns("runs")}
        for name in ("title", "note", "source", "speed_samples"):
            assert columns[name]["nullable"] is False
            assert columns[name]["default"] is not None
        indexes = {index["name"] for index in inspector.get_indexes("runs")}
        assert {"ix_runs_owner_started", "ix_runs_rankable_started"} <= indexes
        with pytest.raises(IntegrityError):
            with Session(engine) as db:
                db.add(Run(user_id=user_id, started_at=start, ended_at=end,
                           distance_m=1, duration_s=1, path=[], source="invalid"))
                db.commit()
    finally:
        engine.dispose()


def test_new_database_migration_is_rerunnable_and_creates_constraints():
    engine = create_engine("sqlite://")
    try:
        migrate(engine)
        migrate(engine)
        inspector = inspect(engine)
        assert set(inspector.get_table_names()) == {"users", "auth_sessions", "runs"}
        checks = {check["name"] for check in inspector.get_check_constraints("runs")}
        assert "ck_runs_source" in checks
        indexes = {index["name"] for index in inspector.get_indexes("runs")}
        assert {"ix_runs_owner_started", "ix_runs_rankable_started"} <= indexes
    finally:
        engine.dispose()
