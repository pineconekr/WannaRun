from uuid import uuid4

import pytest

from backend.tests.conftest import register_and_login

RUN = {
    "started_at": "2026-10-26T09:00:00+09:00",
    "ended_at": "2026-10-26T09:30:00+09:00",
    "distance_m": 5000.0,
    "duration_s": 1800,
    "path": [[35.1688, 129.1258], [35.17, 129.13]],
}


def test_save_list_and_read_own_runs(api):
    client, _ = api
    _, _, headers = register_and_login(client)
    later = {**RUN, "started_at": "2026-10-27T09:00:00+09:00", "ended_at": "2026-10-27T09:10:00+09:00"}
    first = client.post("/api/runs", headers=headers, json=RUN)
    second = client.post("/api/runs", headers=headers, json=later)
    assert first.status_code == 201 and second.status_code == 201
    saved = first.json()
    assert saved["distance_m"] == 5000.0 and saved["path"] == RUN["path"]
    listed = client.get("/api/runs", headers=headers).json()
    # +09:00 입력은 같은 순간의 UTC로 저장·반환.
    assert saved["started_at"].startswith("2026-10-26T00:00:00")
    assert saved["started_at"].endswith(("Z", "+00:00"))
    assert [run["id"] for run in listed] == [second.json()["id"], saved["id"]]
    assert client.get(f"/api/runs/{saved['id']}", headers=headers).json() == saved


def test_runs_are_private(api):
    client, _ = api
    _, _, owner = register_and_login(client)
    _, _, other = register_and_login(client, "other_runner")
    run_id = client.post("/api/runs", headers=owner, json=RUN).json()["id"]
    assert client.get("/api/runs", headers=other).json() == []
    assert client.get(f"/api/runs/{run_id}", headers=other).status_code == 404
    assert client.get("/api/runs").status_code == 401
    assert client.post("/api/runs", json=RUN).status_code == 401


def test_invalid_run_rejected(api):
    client, _ = api
    _, _, headers = register_and_login(client)
    for bad in [
        {**RUN, "ended_at": "2026-10-26T08:00:00+09:00"},
        {**RUN, "distance_m": -1},
        {**RUN, "path": [[35.1]]},
        {**RUN, "user_id": "someone"},
    ]:
        assert client.post("/api/runs", headers=headers, json=bad).status_code == 422
    assert client.get("/api/runs", headers=headers).json() == []


def test_metadata_samples_roundtrip_and_owner_only_patch(api):
    client, _ = api
    _, _, owner = register_and_login(client)
    _, _, other = register_and_login(client, "other_runner")
    payload = {
        **RUN,
        "id": str(uuid4()),
        "title": "해변 러닝",
        "note": "가볍게 달리기",
        "source": "demo",
        "speed_samples": [
            {"elapsed_s": 0, "mps": 0},
            {"elapsed_s": 20.5, "mps": 2.75},
            {"elapsed_s": 1800, "mps": 0},
        ],
    }
    response = client.post("/api/runs", headers=owner, json=payload)
    assert response.status_code == 201
    saved = response.json()
    for field in ("id", "title", "note", "source", "speed_samples"):
        assert saved[field] == payload[field]
    url = f"/api/runs/{saved['id']}"
    assert client.patch(url, headers=other, json={"note": "침입"}).status_code == 404
    assert client.patch(url, json={"note": "침입"}).status_code == 401
    changed = client.patch(url, headers=owner, json={"title": "새 제목"}).json()
    assert changed == {**saved, "title": "새 제목"}
    changed = client.patch(url, headers=owner, json={"note": ""}).json()
    assert changed["note"] == "" and changed["title"] == "새 제목"
    assert client.get(url, headers=owner).json() == changed
    assert client.get("/api/runs", headers=owner).json() == [changed]
    for patch in ({"title": None}, {"note": None}, {"title": ""}, {"distance_m": 1},
                  {"source": "gps"}, {"speed_samples": []}, {"title": "x" * 121},
                  {"note": "x" * 2001}):
        assert client.patch(url, headers=owner, json=patch).status_code == 422


def test_client_id_retries_never_overwrite_or_expose_other_owners(api):
    client, _ = api
    _, _, owner = register_and_login(client)
    _, _, other = register_and_login(client, "other_runner")
    payload = {**RUN, "id": str(uuid4())}
    first = client.post("/api/runs", headers=owner, json=payload)
    assert first.status_code == 201
    saved = first.json()
    assert saved["title"] == "오늘의 러닝"
    assert saved["note"] == "" and saved["speed_samples"] == []
    assert saved["source"] == "gps"
    retry = client.post("/api/runs", headers=owner, json={**payload, "distance_m": 99})
    assert retry.status_code == 200 and retry.json() == saved
    patched = client.patch(f"/api/runs/{saved['id']}", headers=owner,
                           json={"note": "수정 유지"}).json()
    assert client.post("/api/runs", headers=owner, json=payload).json() == patched
    conflict = client.post("/api/runs", headers=other, json=payload)
    assert conflict.status_code == 409
    assert set(conflict.json()) == {"detail"}
    assert client.get("/api/runs", headers=owner).json() == [patched]
    assert client.get("/api/runs", headers=other).json() == []


@pytest.mark.parametrize("changes", [
    {"id": "not-a-uuid"},
    {"distance_m": "Infinity"},
    {"path": [[91, 0]]},
    {"path": [[-91, 0]]},
    {"path": [[0, 181]]},
    {"path": [[0, -181]]},
    {"path": [["NaN", 0]]},
    {"path": [[0, "Infinity"]]},
    {"speed_samples": [{"elapsed_s": -1, "mps": 0}]},
    {"speed_samples": [{"elapsed_s": 0, "mps": -1}]},
    {"speed_samples": [{"elapsed_s": "Infinity", "mps": 0}]},
    {"speed_samples": [{"elapsed_s": 0, "mps": "NaN"}]},
    {"speed_samples": [{"elapsed_s": 1801, "mps": 1}]},
    {"speed_samples": [{"elapsed_s": 10, "mps": 1}, {"elapsed_s": 9, "mps": 1}]},
])
def test_invalid_coordinates_samples_and_uuid(api, changes):
    client, _ = api
    _, _, headers = register_and_login(client)
    assert client.post("/api/runs", headers=headers, json={**RUN, **changes}).status_code == 422
    assert client.get("/api/runs", headers=headers).json() == []


def test_uuid_routes_and_equal_start_time_order(api):
    client, _ = api
    _, _, headers = register_and_login(client)
    low = "00000000-0000-4000-8000-000000000001"
    high = "00000000-0000-4000-8000-000000000002"
    for run_id in (high, low):
        assert client.post("/api/runs", headers=headers,
                           json={**RUN, "id": run_id}).status_code == 201
    assert [row["id"] for row in client.get("/api/runs", headers=headers).json()] == [high, low]
    assert client.get("/api/runs/invalid", headers=headers).status_code == 422
    assert client.patch("/api/runs/invalid", headers=headers, json={"note": ""}).status_code == 422
    assert client.get(f"/api/runs/{uuid4()}", headers=headers).status_code == 404
