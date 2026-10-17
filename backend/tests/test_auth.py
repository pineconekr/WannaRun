import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend.auth import token_digest
from backend.database import get_db
from backend.main import app
from backend.models import AuthSession, Base, User


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


def register_and_login(client, email="runner@example.com"):
    account = {"email": email, "password": "test-password-123"}
    signup = client.post("/api/auth/signup", json=account)
    assert signup.status_code == 201
    login = client.post("/api/auth/login", json=account)
    assert login.status_code == 200
    token = login.json()["access_token"]
    return signup.json(), token, {"Authorization": f"Bearer {token}"}


def test_account_onboarding_and_logout(api):
    client, engine = api
    user, token, headers = register_and_login(client)
    assert user["onboarding_completed"] is False
    assert "password" not in user and "password_hash" not in user
    with Session(engine) as db:
        stored = db.get(User, user["id"])
        assert stored.password_hash != "test-password-123"
        assert db.get(AuthSession, token_digest(token)) is not None
        assert db.get(AuthSession, token) is None
    updated = client.patch(
        "/api/users/me", headers=headers,
        json={"nickname": "러너", "onboarding_completed": True},
    )
    assert updated.status_code == 200
    assert updated.json()["nickname"] == "러너"
    assert updated.json()["onboarding_completed"] is True
    # 닉네임만 변경해도 기존 온보딩 완료 상태 유지.
    client.patch("/api/users/me", headers=headers, json={"nickname": "새러너"})
    assert client.get("/api/users/me", headers=headers).json() == {
        **user, "nickname": "새러너", "onboarding_completed": True,
    }
    assert client.post("/api/auth/logout", headers=headers).status_code == 204
    assert client.get("/api/users/me", headers=headers).status_code == 401


def test_duplicate_email_and_wrong_password(api):
    client, _ = api
    register_and_login(client)
    duplicate = client.post("/api/auth/signup", json={
        "email": "RUNNER@example.com", "password": "another-password",
    })
    assert duplicate.status_code == 409
    for email in ["runner@example.com", "missing@example.com"]:
        response = client.post("/api/auth/login", json={
            "email": email, "password": "wrong-password",
        })
        assert response.status_code == 401
        assert response.json() == {"detail": "이메일 또는 비밀번호 확인"}


def test_missing_invalid_expired_token_and_account_isolation(api):
    client, engine = api
    first, token, headers = register_and_login(client)
    second, _, other_headers = register_and_login(client, "other@example.com")
    assert client.get("/api/users/me").status_code == 401
    assert client.get("/api/users/me", headers={
        "Authorization": "Bearer invalid",
    }).status_code == 401
    assert client.patch("/api/users/me", headers=headers, json={
        "id": second["id"], "nickname": "공격",
    }).status_code == 422
    client.patch("/api/users/me", headers=headers, json={"nickname": "내이름"})
    assert client.get("/api/users/me", headers=other_headers).json()["nickname"] is None
    with Session(engine) as db:
        session = db.get(AuthSession, token_digest(token))
        session.expires_at = time.time() - 1
        db.commit()
    assert client.get("/api/users/me", headers=headers).status_code == 401


def test_invalid_signup_does_not_create_user(api):
    client, engine = api
    for payload in [
        {"email": "not-email", "password": "valid-password"},
        {"email": "runner@example.com", "password": "short"},
    ]:
        assert client.post("/api/auth/signup", json=payload).status_code == 422
    with Session(engine) as db:
        assert db.scalar(select(User)) is None
