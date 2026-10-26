import time

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.auth import token_digest
from backend.models import AuthSession, User
from backend.tests.conftest import register_and_login


def test_account_and_logout(api):
    client, engine = api
    user, token, headers = register_and_login(client)
    assert user["username"] == "runner_01"
    assert "password" not in user and "password_hash" not in user
    with Session(engine) as db:
        stored = db.get(User, user["id"])
        assert stored.password_hash != "test-password-123"
        assert db.get(AuthSession, token_digest(token)) is not None
        assert db.get(AuthSession, token) is None
    assert client.get("/api/users/me", headers=headers).json() == user
    assert client.post("/api/auth/logout", headers=headers).status_code == 204
    assert client.get("/api/users/me", headers=headers).status_code == 401


def test_username_is_case_insensitive(api):
    client, _ = api
    user, _, _ = register_and_login(client, "Runner_01")
    assert user["username"] == "runner_01"
    duplicate = client.post("/api/auth/signup", json={
        "username": "RUNNER_01", "password": "another-password",
    })
    assert duplicate.status_code == 409
    login = client.post("/api/auth/login", json={
        "username": "RUNNER_01", "password": "test-password-123",
    })
    assert login.status_code == 200


def test_wrong_password_and_unknown_username(api):
    client, _ = api
    register_and_login(client)
    for username in ["runner_01", "missing_user"]:
        response = client.post("/api/auth/login", json={
            "username": username, "password": "wrong-password",
        })
        assert response.status_code == 401
        assert response.json() == {"detail": "아이디 또는 비밀번호 확인"}


def test_missing_invalid_expired_token_and_account_isolation(api):
    client, engine = api
    first, token, headers = register_and_login(client)
    second, _, other_headers = register_and_login(client, "other_runner")
    assert client.get("/api/users/me").status_code == 401
    assert client.get("/api/users/me", headers={
        "Authorization": "Bearer invalid",
    }).status_code == 401
    assert client.get("/api/users/me", headers=headers).json() == first
    assert client.get("/api/users/me", headers=other_headers).json() == second
    with Session(engine) as db:
        session = db.get(AuthSession, token_digest(token))
        session.expires_at = time.time() - 1
        db.commit()
    assert client.get("/api/users/me", headers=headers).status_code == 401


@pytest.mark.parametrize("username", ["abc", "a" * 21, "run ner", "러너러너", "run-ner"])
def test_invalid_username_rejected(api, username):
    client, engine = api
    response = client.post("/api/auth/signup", json={
        "username": username, "password": "valid-password",
    })
    assert response.status_code == 422
    with Session(engine) as db:
        assert db.scalar(select(User)) is None


def test_short_password_rejected(api):
    client, engine = api
    response = client.post("/api/auth/signup", json={
        "username": "runner_01", "password": "short",
    })
    assert response.status_code == 422
    with Session(engine) as db:
        assert db.scalar(select(User)) is None
