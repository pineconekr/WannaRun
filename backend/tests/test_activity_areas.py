from datetime import datetime, timezone

from sqlalchemy.orm import Session

from backend.models import Run, User
from backend.tests.conftest import register_and_login

START = datetime(2026, 11, 5, tzinfo=timezone.utc)


def run(user_id, path, source="gps"):
    return Run(user_id=user_id, started_at=START, ended_at=START, distance_m=1000, duration_s=300, path=path, source=source)


def test_areas_are_coarse_cells_counting_rankable_runs_only(api):
    client, engine = api
    _, _, headers = register_and_login(client)
    with Session(engine) as db:
        runner = User(username="area_runner", password_hash="not-used")
        db.add(runner)
        db.flush()
        # 같은 2km 칸 안의 두 경로, 다른 칸으로 넘어가는 경로 하나, 집계되지 않는 데모·기존 기록
        db.add_all([
            run(runner.id, [[35.1688, 129.1258], [35.1690, 129.1262]]),
            run(runner.id, [[35.1701, 129.1249]]),
            run(runner.id, [[35.1688, 129.1258], [35.1912, 129.1258]]),
            run(runner.id, [[37.5, 127.0]], source="demo"),
            run(runner.id, [[37.5, 127.0]], source="legacy"),
        ])
        db.commit()
        runner_id = runner.id

    response = client.get(f"/api/users/{runner_id}/areas", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["username"] == "area_runner"
    assert body["areas"] == [
        {"lat": 35.17, "lng": 129.13, "runs": 3},
        {"lat": 35.19, "lng": 129.13, "runs": 1},
    ]


def test_areas_require_login_and_known_runner(api):
    client, _ = api
    assert client.get("/api/users/someone/areas").status_code == 401
    _, _, headers = register_and_login(client)
    assert client.get("/api/users/missing/areas", headers=headers).status_code == 404
