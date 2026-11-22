import json
from pathlib import Path

import h3
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.models import Run, TerritoryCell, TerritoryOwner
from backend.territory import H3_RESOLUTION, cells_along, rebuild_all
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


def test_rebuild_recomputes_owners_from_runs(api):
    client, engine = api
    _, _, alice = register_and_login(client, "alice_01")
    _, _, bob = register_and_login(client, "bob_0001")
    post_run(client, alice, EAST_LONGER)
    post_run(client, bob, EAST, started_at="2026-11-11T00:00:00Z", ended_at="2026-11-11T00:10:00Z")
    expected = {"alice": territory(client, alice), "bob": territory(client, bob)}
    with Session(engine) as db, db.begin():
        db.query(TerritoryOwner).delete()
        db.query(TerritoryCell).delete()
    assert territory(client, alice)["total"] == 0
    with Session(engine) as db, db.begin():
        totals = rebuild_all(db)
    assert sorted(totals.values()) == sorted(case["total"] for case in expected.values())
    for name, headers in (("alice", alice), ("bob", bob)):
        rebuilt = territory(client, headers)
        assert set(rebuilt["cells"]) == set(expected[name]["cells"])
        assert rebuilt["lost"] == expected[name]["lost"]


def at(day: int) -> dict:
    return {"started_at": f"2026-11-{day:02d}T00:00:00Z", "ended_at": f"2026-11-{day:02d}T00:10:00Z"}


def area(client, headers, south=35.16, west=129.12, north=35.18, east=129.14):
    return client.get("/api/territory", params={"south": south, "west": west, "north": north, "east": east}, headers=headers)


def test_a_later_run_steals_cells_and_the_old_owner_keeps_their_history(api):
    client, _ = api
    _, _, alice = register_and_login(client, "alice_01")
    _, _, bob = register_and_login(client, "bob_0001")
    post_run(client, alice, EAST_LONGER, **at(10))
    alice_cells = set(territory(client, alice)["cells"])
    assert alice_cells == set(cells_along(EAST_LONGER))

    post_run(client, bob, EAST, **at(11))
    bob_cells = set(cells_along(EAST))
    stolen = alice_cells & bob_cells
    assert stolen
    after = territory(client, alice)
    assert set(after["cells"]) == alice_cells - stolen
    assert after["lost"] == len(stolen)
    assert set(territory(client, bob)["cells"]) == bob_cells
    # 빼앗겨도 러닝 기록은 그대로입니다.
    assert len(client.get("/api/runs", headers=alice).json()) == 1

    # 다시 달리면 되찾습니다.
    post_run(client, alice, EAST, **at(12))
    assert set(territory(client, alice)["cells"]) == alice_cells | bob_cells
    assert territory(client, bob) == {"resolution": H3_RESOLUTION, "total": 0, "cells": [], "lost": len(bob_cells)}


def test_an_older_run_saved_later_does_not_steal(api):
    client, _ = api
    _, _, alice = register_and_login(client, "alice_01")
    _, _, bob = register_and_login(client, "bob_0001")
    post_run(client, alice, EAST, **at(12))
    post_run(client, bob, EAST_LONGER, **at(10))  # 오프라인으로 늦게 올린 더 오래된 러닝
    assert set(territory(client, alice)["cells"]) == set(cells_along(EAST))
    bob_now = territory(client, bob)
    assert set(bob_now["cells"]) == set(cells_along(EAST_LONGER)) - set(cells_along(EAST))
    assert bob_now["lost"] == len(set(cells_along(EAST_LONGER)) & set(cells_along(EAST)))


def test_runs_starting_at_the_same_time_go_to_the_larger_run_id(api):
    client, _ = api
    _, _, alice = register_and_login(client, "alice_01")
    _, _, bob = register_and_login(client, "bob_0001")
    post_run(client, alice, EAST, id="ffffffff-0000-4000-8000-000000000000", **at(10))
    post_run(client, bob, EAST, id="00000000-0000-4000-8000-000000000000", **at(10))
    assert territory(client, alice)["total"] == len(cells_along(EAST))
    assert territory(client, bob)["total"] == 0


def test_demo_runs_compete_like_gps_runs(api):
    client, _ = api
    _, _, alice = register_and_login(client, "alice_01")
    _, _, bob = register_and_login(client, "bob_0001")
    post_run(client, alice, EAST, **at(10))
    post_run(client, bob, EAST, source="demo", **at(11))
    assert territory(client, alice)["total"] == 0


def test_clearing_frees_my_cells_and_older_runs_do_not_bring_them_back(api):
    client, _ = api
    _, _, alice = register_and_login(client, "alice_01")
    _, _, bob = register_and_login(client, "bob_0001")
    post_run(client, alice, EAST_LONGER, **at(10))
    post_run(client, bob, EAST, **at(11))
    assert client.delete("/api/users/me/territory", headers=bob).status_code == 204
    # 지운 칸은 빈 칸이 됩니다(이전 주인에게 돌아가지 않음).
    assert territory(client, bob) == {"resolution": H3_RESOLUTION, "total": 0, "cells": [], "lost": 0}
    assert set(territory(client, alice)["cells"]) == set(cells_along(EAST_LONGER)) - set(cells_along(EAST))
    assert area(client, alice).json()["others"] == []
    # 지우기 전에 시작한 러닝을 늦게 올려도 영토가 되지 않고, 지운 뒤에 시작한 러닝은 다시 차지합니다.
    post_run(client, bob, EAST, **at(12))
    assert territory(client, bob)["total"] == 0
    post_run(client, bob, EAST, started_at="2099-01-01T00:00:00Z", ended_at="2099-01-01T00:10:00Z")
    assert territory(client, bob)["total"] == len(cells_along(EAST))


def test_area_splits_mine_and_others_without_naming_owners(api):
    client, _ = api
    _, _, alice = register_and_login(client, "alice_01")
    _, _, bob = register_and_login(client, "bob_0001")
    post_run(client, alice, EAST_LONGER, **at(10))
    post_run(client, bob, EAST, **at(11))
    body = area(client, alice).json()
    assert set(body) == {"resolution", "mine", "others", "truncated"}
    assert set(body["mine"]) == set(cells_along(EAST_LONGER)) - set(cells_along(EAST))
    assert set(body["others"]) == set(cells_along(EAST))
    assert body["truncated"] is False
    # 영역 밖의 칸은 오지 않습니다.
    assert area(client, alice, south=35.0, west=129.0, north=35.1, east=129.1).json() == {
        "resolution": H3_RESOLUTION, "mine": [], "others": [], "truncated": False,
    }
    assert area(client, alice, south=35.18, north=35.16).status_code == 422
    assert area(client, alice, west=129.0, east=129.5).status_code == 422
    assert area(client, {}).status_code == 401


def test_territory_leaderboard_ranks_current_holdings(api):
    client, _ = api
    alice_user, _, alice = register_and_login(client, "alice_01")
    bob_user, _, bob = register_and_login(client, "bob_0001")
    register_and_login(client, "carol_01")
    post_run(client, alice, EAST_LONGER, **at(10))
    post_run(client, bob, EAST, **at(11))
    response = client.get("/api/leaderboard/territory", headers=alice)
    assert response.status_code == 200
    alice_cells = len(set(cells_along(EAST_LONGER)) - set(cells_along(EAST)))
    bob_cells = len(cells_along(EAST))
    expected = sorted(
        [(alice_user["id"], "alice_01", alice_cells), (bob_user["id"], "bob_0001", bob_cells)],
        key=lambda entry: -entry[2],
    )
    assert response.json()["entries"] == [
        {"rank": rank, "user_id": user_id, "username": username, "cells": cells}
        for rank, (user_id, username, cells) in enumerate(expected, start=1)
    ]
    assert client.get("/api/leaderboard/territory").status_code == 401
