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
