import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend.database import get_db
from backend.main import app
from backend.models import Base


@pytest.fixture
def api():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)

    def test_db():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_db] = test_db
    try:
        with TestClient(app) as client:
            yield client, engine
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


def register_and_login(client, username="runner_01"):
    account = {"username": username, "password": "test-password-123"}
    signup = client.post("/api/auth/signup", json=account)
    assert signup.status_code == 201
    login = client.post("/api/auth/login", json=account)
    assert login.status_code == 200
    token = login.json()["access_token"]
    return signup.json(), token, {"Authorization": f"Bearer {token}"}
