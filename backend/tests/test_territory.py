import json
from pathlib import Path

import h3
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.models import Run, TerritoryCell
from backend.territory import H3_RESOLUTION, cells_along, rebuild_user
from backend.tests.conftest import register_and_login

EAST = [[35.1688, 129.1258], [35.1688, 129.1300]]  # 약 380m
EAST_LONGER = [[35.1688, 129.1258], [35.1688, 129.1340]]  # EAST를 포함하고 더 멀리 감


def post_run(client, headers, path, distance_m=380, source="gps", **extra):
    body = {
        "started_at": "2026-11-10T00:00:00Z", "ended_at": "2026-11-10T00:10:00Z",
        "distance_m": distance_m, "duration_s": 600, "path": path, "source": source, **extra,
    }
    response = client.post("/api/runs", json=body, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def territory(client, headers):
    response = client.get("/api/users/me/territory", headers=headers)
    assert response.status_code == 200
    return response.json()


def test_cells_along_is_ordered_unique_and_connected():
    assert len(cells_along([[35.1688, 129.1258]])) == 1
    cells = cells_along(EAST)
    assert len(cells) == len(set(cells)) > 5
    assert cells[0] == h3.latlng_to_cell(35.1688, 129.1258, H3_RESOLUTION)
    assert cells[-1] == h3.latlng_to_cell(35.1688, 129.1300, H3_RESOLUTION)
    # 이어진 칸은 서로 이웃해야 합니다(경로에 구멍이 없음).
    assert all(h3.are_neighbor_cells(a, b) for a, b in zip(cells, cells[1:]))
    # 같은 칸을 다시 지나가도 늘지 않습니다.
    assert cells_along(EAST + EAST[::-1]) == cells


def test_cells_match_the_frontend_golden_file():
    # frontend/tests/territory.test.ts가 같은 파일로 프론트의 계산을 검사합니다. 둘이 같아야 미리보기와 저장값이 일치합니다.
    golden = json.loads((Path(__file__).parents[2] / "frontend" / "tests" / "territory-golden.json").read_text("utf-8"))
    assert golden
    for name, case in golden.items():
        assert cells_along(case["path"]) == case["cells"], name


def test_gps_jump_does_not_fill_cells_in_between():
    # 약 20km 떨어진 두 점: 사이를 채우면 수천 칸이 되므로 양 끝 칸만 남깁니다.
    assert len(cells_along([[35.1688, 129.1258], [35.30, 129.30]])) == 2


def test_run_claims_territory_and_later_run_only_adds_new_cells(api):
    client, _ = api
    _, _, headers = register_and_login(client)
    assert territory(client, headers)["cells"] == []

    post_run(client, headers, EAST)
    first = territory(client, headers)
    assert first["resolution"] == H3_RESOLUTION and first["total"] == len(first["cells"]) > 5

    post_run(client, headers, EAST_LONGER)
    second = territory(client, headers)
    assert set(first["cells"]) < set(second["cells"])
    # 영토는 지나간 칸의 합집합입니다(이전 칸은 지워지지 않음).
    assert set(second["cells"]) == set(cells_along(EAST)) | set(cells_along(EAST_LONGER))


def test_territory_is_per_user_and_requires_login(api):
    client, _ = api
    _, _, alice = register_and_login(client, "alice_01")
    _, _, bob = register_and_login(client, "bob_0001")
    post_run(client, alice, EAST)
    assert territory(client, alice)["total"] > 0
    assert territory(client, bob)["total"] == 0
    assert client.get("/api/users/me/territory").status_code == 401


def test_short_legacy_and_retried_runs_do_not_claim(api):
    client, _ = api
    _, _, headers = register_and_login(client)
    post_run(client, headers, [[35.1688, 129.1258], [35.1689, 129.1258]], distance_m=49)
    post_run(client, headers, EAST, source="legacy")
    assert territory(client, headers)["total"] == 0

    saved = post_run(client, headers, EAST, id="0f9f1d5e-3b7a-4c0e-9a55-2d3f6f8a1b11")
    total = territory(client, headers)["total"]
    assert total > 0
    retry = client.post("/api/runs", json={
        "id": saved["id"], "started_at": "2026-11-10T00:00:00Z", "ended_at": "2026-11-10T00:10:00Z",
        "distance_m": 380, "duration_s": 600, "path": EAST,
    }, headers=headers)
    assert retry.status_code == 200
    assert territory(client, headers)["total"] == total


def test_clear_removes_territory_but_keeps_runs(api):
    client, engine = api
    _, _, headers = register_and_login(client)
    post_run(client, headers, EAST)
    assert client.delete("/api/users/me/territory", headers=headers).status_code == 204
    assert territory(client, headers)["total"] == 0
    assert len(client.get("/api/runs", headers=headers).json()) == 1
    with Session(engine) as db:
        assert db.scalar(select(func.count(Run.id))) == 1


def test_rebuild_recomputes_from_runs(api):
    client, engine = api
    user, _, headers = register_and_login(client)
    post_run(client, headers, EAST_LONGER)
    expected = territory(client, headers)["total"]
    with Session(engine) as db, db.begin():
        db.query(TerritoryCell).delete()
    assert territory(client, headers)["total"] == 0
    with Session(engine) as db, db.begin():
        assert rebuild_user(db, user["id"]) == expected
    assert territory(client, headers)["total"] == expected
