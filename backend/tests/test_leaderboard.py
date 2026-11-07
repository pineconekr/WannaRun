from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.orm import Session

from backend.leaderboard import utc_now
from backend.main import app
from backend.models import Run, User
from backend.tests.conftest import register_and_login
from backend.tests.test_runs import RUN


def add_run(db, user_id, distance=1000, duration=300, source="gps", started_at=None):
    start = started_at or datetime(2026, 11, 5, tzinfo=timezone.utc)
    db.add(Run(
        user_id=user_id,
        started_at=start,
        ended_at=start + timedelta(seconds=duration),
        distance_m=distance,
        duration_s=duration,
        path=[[35.1, 129.1]],
        source=source,
    ))


def test_sql_totals_ties_demo_legacy_exclusion_and_no_private_routes(api):
    client, engine = api
    owner, _, headers = register_and_login(client, "bravo_runner")
    with Session(engine) as db:
        alpha = User(username="alpha_runner", password_hash="not-used")
        charlie = User(username="charlie_runner", password_hash="not-used")
        demos = User(username="demo_only", password_hash="not-used")
        db.add_all([alpha, charlie, demos])
        db.flush()
        add_run(db, owner["id"], distance=1200, duration=400)
        add_run(db, owner["id"], distance=800, duration=200)
        add_run(db, alpha.id, distance=2000, duration=500)
        add_run(db, charlie.id, distance=1000, duration=300)
        for source in ("demo", "legacy"):
            add_run(db, owner["id"], distance=999999, source=source)
            add_run(db, demos.id, distance=999999, source=source)
        add_run(db, owner["id"], distance=999999, duration=0)
        add_run(db, owner["id"], distance=0, duration=999999)
        db.commit()
    response = client.get("/api/leaderboard?period=all", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"period", "entries"} and body["period"] == "all"
    rows = body["entries"]
    assert [row["username"] for row in rows] == ["alpha_runner", "bravo_runner", "charlie_runner"]
    assert [row["rank"] for row in rows] == [1, 1, 3]
    assert [row["total_distance_m"] for row in rows] == [2000, 2000, 1000]
    assert [row["total_duration_s"] for row in rows] == [500, 600, 300]
    assert [row["run_count"] for row in rows] == [1, 2, 1]
    for row in rows:
        assert set(row) == {"rank", "user_id", "username", "total_distance_m", "total_duration_s", "run_count"}
    assert client.get("/api/users/me/stats", headers=headers).json() == {
        "total_distance_m": 2000.0, "total_duration_s": 600, "run_count": 2,
    }


@pytest.mark.parametrize("period,now,start,end", [
    # Sunday 23:59 KST is still the week that began Monday 2026-11-02 00:00 KST.
    ("week", "2026-11-08T23:59:59+09:00", "2026-11-02T00:00:00+09:00", "2026-11-09T00:00:00+09:00"),
    # Sunday 23:30 UTC is already Monday 08:30 KST: the new week has begun.
    ("week", "2026-11-08T23:30:00+00:00", "2026-11-09T00:00:00+09:00", "2026-11-16T00:00:00+09:00"),
    ("month", "2026-11-07T12:00:00+00:00", "2026-11-01T00:00:00+09:00", "2026-12-01T00:00:00+09:00"),
    ("month", "2026-12-31T20:00:00+00:00", "2027-01-01T00:00:00+09:00", "2027-02-01T00:00:00+09:00"),
    ("month", "2028-02-29T12:00:00+00:00", "2028-02-01T00:00:00+09:00", "2028-03-01T00:00:00+09:00"),
])
def test_calendar_boundaries_are_kst_start_inclusive_end_exclusive(api, period, now, start, end):
    client, _ = api
    _, _, headers = register_and_login(client)
    app.dependency_overrides[utc_now] = lambda: datetime.fromisoformat(now)
    start = datetime.fromisoformat(start)
    end = datetime.fromisoformat(end)
    for when, distance in (
        (start - timedelta(microseconds=1), 10000),
        (start, 100),
        (end - timedelta(microseconds=1), 200),
        (end, 10000),
    ):
        # Send UTC timestamps so the KST calendar must be applied on the server.
        local = when.astimezone(timezone.utc)
        response = client.post("/api/runs", headers=headers, json={
            **RUN, "started_at": local.isoformat(),
            "ended_at": (local + timedelta(seconds=60)).isoformat(),
            "distance_m": distance, "duration_s": 60,
        })
        assert response.status_code == 201
    rows = client.get(f"/api/leaderboard?period={period}", headers=headers).json()["entries"]
    assert len(rows) == 1
    assert rows[0]["total_distance_m"] == 300
    assert rows[0]["total_duration_s"] == 120 and rows[0]["run_count"] == 2
    all_rows = client.get("/api/leaderboard?period=all", headers=headers).json()["entries"]
    assert all_rows[0]["total_distance_m"] == 20300


def test_empty_stats_isolation_and_authentication(api):
    client, _ = api
    _, _, owner = register_and_login(client)
    _, _, other = register_and_login(client, "other_runner")
    empty = {"total_distance_m": 0.0, "total_duration_s": 0, "run_count": 0}
    assert client.get("/api/users/me/stats", headers=owner).json() == empty
    assert client.get("/api/leaderboard", headers=owner).json() == {"period": "all", "entries": []}
    assert client.post("/api/runs", headers=owner, json=RUN).status_code == 201
    assert client.get("/api/users/me/stats", headers=other).json() == empty
    assert client.get("/api/users/me/stats", headers=owner).json()["run_count"] == 1
    assert client.get("/api/users/me/stats").status_code == 401
    assert client.get("/api/leaderboard").status_code == 401
    assert client.get("/api/leaderboard?period=day", headers=owner).status_code == 422


def test_monday_morning_kst_run_counts_in_new_week(api):
    client, _ = api
    _, _, headers = register_and_login(client)
    # Monday 2026-11-09 10:00 KST; the run at Monday 07:00 KST is Sunday 22:00 UTC.
    app.dependency_overrides[utc_now] = lambda: datetime(2026, 11, 9, 1, tzinfo=timezone.utc)
    for started_at, distance in (("2026-11-09T07:00:00+09:00", 500), ("2026-11-08T23:00:00+09:00", 9000)):
        start = datetime.fromisoformat(started_at)
        response = client.post("/api/runs", headers=headers, json={
            **RUN, "started_at": start.isoformat(),
            "ended_at": (start + timedelta(seconds=60)).isoformat(),
            "distance_m": distance, "duration_s": 60,
        })
        assert response.status_code == 201
    rows = client.get("/api/leaderboard?period=week", headers=headers).json()["entries"]
    assert [row["total_distance_m"] for row in rows] == [500]
