from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.leaderboard import utc_now
from backend.main import app
from backend.models import Run, User
from backend.seed_demo import DEMO_USERNAMES, remove, seed
from backend.tests.conftest import register_and_login

NOW = datetime(2026, 11, 11, 9, tzinfo=timezone.utc)  # 수요일


def test_demo_runners_fill_every_leaderboard_period_and_can_log_in(api):
    client, engine = api
    _, _, headers = register_and_login(client)
    seed(engine, password="demo-password-1", now=NOW)
    app.dependency_overrides[utc_now] = lambda: NOW

    for period in ("all", "week", "month"):
        names = {entry["username"] for entry in client.get(f"/api/leaderboard?period={period}", headers=headers).json()["entries"]}
        assert names == set(DEMO_USERNAMES), period

    login = client.post("/api/auth/login", json={"username": DEMO_USERNAMES[0], "password": "demo-password-1"})
    assert login.status_code == 200
    runs = client.get("/api/runs", headers={"Authorization": f"Bearer {login.json()['access_token']}"})
    assert runs.status_code == 200
    first = runs.json()[0]
    assert first["source"] == "gps" and len(first["path"]) > 2 and first["speed_samples"]


def test_reseeding_replaces_demo_runs_and_remove_spares_real_users(api):
    client, engine = api
    real, token, headers = register_and_login(client)
    client.post("/api/runs", json={
        "started_at": "2026-11-10T00:00:00Z", "ended_at": "2026-11-10T00:10:00Z",
        "distance_m": 2000, "duration_s": 600, "path": [[35.1, 129.1], [35.11, 129.1]],
    }, headers=headers)

    seed(engine, password="demo-password-1", now=NOW)
    with Session(engine) as db:
        demo_runs = db.scalar(select(func.count(Run.id)).join(User).where(User.username.in_(DEMO_USERNAMES)))
    seed(engine, now=NOW)
    with Session(engine) as db:
        assert db.scalar(select(func.count(Run.id)).join(User).where(User.username.in_(DEMO_USERNAMES))) == demo_runs

    assert remove(engine) == len(DEMO_USERNAMES)
    with Session(engine) as db:
        assert list(db.scalars(select(User.username))) == [real["username"]]
        assert db.scalar(select(func.count(Run.id))) == 1
