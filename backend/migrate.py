"""Additive schema upgrade for PostgreSQL and local SQLite, preserving accounts/runs.

Production: set DATABASE_URL and run ``uv run python -m backend.migrate`` (or
``backend.init_db``). Local SQLite: ``uv run python -m backend.migrate --sqlite
backend/auth-test.sqlite3``. Stop local writers during upgrades. Rerunning is safe;
no tables or records are dropped/rebuilt. Back up the database before upgrades.

Existing records are classified as legacy because historical demo/GPS provenance
cannot be established. The SQL source default remains legacy for unclassified
SQL writers; API/ORM creates explicitly default to gps. Ranking and personal
statistics count only positive-distance, positive-duration GPS runs. Calendar
periods use the start timestamp and UTC Monday/month boundaries, end-exclusive.
"""

import argparse
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.schema import CreateColumn

from backend.models import Base, Run

ADDED_COLUMNS = ("title", "note", "source", "speed_samples")


def migrate(engine: Engine) -> None:
    if engine.dialect.name not in {"postgresql", "sqlite"}:
        raise RuntimeError("Migration supports PostgreSQL and SQLite only")
    with engine.begin() as connection:
        if engine.dialect.name == "postgresql":
            # Serialize this command without touching user/session rows.
            connection.execute(text("SELECT pg_advisory_xact_lock(843810410)"))
        Base.metadata.create_all(connection)
        columns = {column["name"] for column in inspect(connection).get_columns("runs")}
        for name in ADDED_COLUMNS:
            if name in columns:
                continue
            definition = str(
                CreateColumn(Run.__table__.c[name]).compile(dialect=engine.dialect)
            )
            if name == "source":
                # Column-level CHECK works for additive ALTER on both engines.
                definition += (
                    " CONSTRAINT ck_runs_source CHECK (source IN ('gps', 'demo', 'legacy'))"
                )
            connection.execute(text(f"ALTER TABLE runs ADD COLUMN {definition}"))
        for index in Run.__table__.indexes:
            index.create(connection, checkfirst=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sqlite", type=Path, help="Upgrade this local SQLite file")
    args = parser.parse_args()
    if args.sqlite is not None:
        engine = create_engine(f"sqlite:///{args.sqlite.resolve().as_posix()}")
    else:
        from backend.database import engine

        if engine is None:
            raise RuntimeError("DATABASE_URL 설정 필요 (또는 --sqlite 파일 경로).")
    try:
        migrate(engine)
        print("스키마 준비 완료: 계정·기존 기록 유지")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
