"""Additive schema upgrade for PostgreSQL (Neon), preserving accounts/runs.

Set DATABASE_URL and run ``uv run python -m backend.migrate`` (or
``backend.init_db``). Rerunning is safe; no tables or records are
dropped/rebuilt. Back up the database before upgrades.

Existing records are classified as legacy because historical demo/GPS provenance
cannot be established. The SQL source default remains legacy for unclassified
SQL writers; API/ORM creates explicitly default to gps. Ranking and personal
statistics count only positive-distance, positive-duration GPS runs. Calendar
periods use the start timestamp and UTC Monday/month boundaries, end-exclusive.

Competitive territory adds ``territory_owners`` (one current owner per cell) and
the nullable ``users.territory_cleared_at``. When ``territory_owners`` is first
created it is filled from the existing ``territory_cells`` rows in the same
transaction; ``territory_cells`` itself is left untouched.
"""

import argparse

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.schema import CreateColumn

from backend.models import Base, Run, User

ADDED_COLUMNS = {
    "runs": (Run, ("title", "note", "source", "speed_samples")),
    "users": (User, ("territory_cleared_at",)),
}


def migrate(engine: Engine) -> None:
    if engine.dialect.name not in {"postgresql", "sqlite"}:
        raise RuntimeError("Migration supports PostgreSQL and SQLite only")
    with engine.begin() as connection:
        if engine.dialect.name == "postgresql":
            # Serialize this command without touching user/session rows.
            connection.execute(text("SELECT pg_advisory_xact_lock(843810410)"))
        had_owners = inspect(connection).has_table("territory_owners")
        Base.metadata.create_all(connection)
        for table, (model, names) in ADDED_COLUMNS.items():
            columns = {column["name"] for column in inspect(connection).get_columns(table)}
            for name in names:
                if name in columns:
                    continue
                definition = str(
                    CreateColumn(model.__table__.c[name]).compile(dialect=engine.dialect)
                )
                if name == "source":
                    # Column-level CHECK works for additive ALTER on both engines.
                    definition += (
                        " CONSTRAINT ck_runs_source CHECK (source IN ('gps', 'demo', 'legacy'))"
                    )
                connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {definition}"))
        for index in Run.__table__.indexes:
            index.create(connection, checkfirst=True)
        if not had_owners:
            from backend.territory import seed_owners

            seed_owners(connection)


def main() -> None:
    argparse.ArgumentParser(description=__doc__).parse_args()
    from backend.database import engine

    if engine is None:
        raise RuntimeError("DATABASE_URL 설정 필요.")
    try:
        migrate(engine)
        print("스키마 준비 완료: 계정·기존 기록 유지")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
