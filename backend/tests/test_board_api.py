from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import db, main


@pytest.fixture()
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    db_path = tmp_path / "pm-test.db"
    monkeypatch.setattr(main, "DB_PATH", db_path)

    db.init_db(db_path)
    user_id = db.ensure_user(db_path, main.VALID_USERNAME)
    db.ensure_board(db_path, user_id)

    with TestClient(main.app) as test_client:
        yield test_client


def login(client: TestClient) -> None:
    response = client.post(
        "/auth/login",
        json={"username": "user", "password": "password"},
    )
    assert response.status_code == 200


def test_get_board_requires_auth(client: TestClient) -> None:
    response = client.get("/api/board")
    assert response.status_code == 401


def test_get_board_returns_snapshot_for_authenticated_user(client: TestClient) -> None:
    login(client)

    response = client.get("/api/board")
    assert response.status_code == 200

    payload = response.json()
    assert payload["version"] == 1
    assert "updated_at" in payload
    assert "columns" in payload["board"]
    assert "cards" in payload["board"]


def test_put_board_persists_changes(client: TestClient) -> None:
    login(client)

    first_read = client.get("/api/board")
    assert first_read.status_code == 200

    board_payload = first_read.json()
    board_payload["board"]["columns"][0]["title"] = "Now"

    update_response = client.put(
        "/api/board",
        json={
            "board": board_payload["board"],
            "expected_version": board_payload["version"],
        },
    )
    assert update_response.status_code == 200

    second_read = client.get("/api/board")
    assert second_read.status_code == 200

    updated_payload = second_read.json()
    assert updated_payload["version"] == board_payload["version"] + 1
    assert updated_payload["board"]["columns"][0]["title"] == "Now"


def test_put_board_rejects_version_conflict(client: TestClient) -> None:
    login(client)

    current = client.get("/api/board")
    assert current.status_code == 200

    payload = current.json()
    response = client.put(
        "/api/board",
        json={
            "board": payload["board"],
            "expected_version": 999,
        },
    )

    assert response.status_code == 409
    assert "Version mismatch" in response.json()["detail"]
