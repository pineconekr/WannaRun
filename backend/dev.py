"""Local development entrypoint; production continues using backend.main:app."""
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.main import app
from backend.models import Base

db_path = Path(__file__).with_name("auth-test.sqlite3")
engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})


@event.listens_for(engine, "connect")
def enable_foreign_keys(connection, _record):
    connection.execute("PRAGMA foreign_keys=ON")


Base.metadata.create_all(engine)


def local_db():
    with Session(engine) as session:
        yield session


app.dependency_overrides[get_db] = local_db
