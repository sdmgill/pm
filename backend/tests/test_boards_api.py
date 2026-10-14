from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import main


@pytest.fixture()
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setattr(main, "DB_PATH", tmp_path / "pm-boards.db")
    with TestClient(main.app) as test_client:
        test_client.post("/auth/login", json={"username": "user", "password": "password"})
        yield test_client


def test_boards_require_auth(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(main, "DB_PATH", tmp_path / "pm-boards.db")
    with TestClient(main.app) as anonymous:
        assert anonymous.get("/api/boards").status_code == 401
        assert anonymous.post("/api/boards", json={"name": "x"}).status_code == 401
        assert anonymous.get("/api/boards/1").status_code == 401


def test_list_boards_has_default_board(client: TestClient) -> None:
    boards = client.get("/api/boards").json()

    assert len(boards) == 1
    assert boards[0]["name"] == "My Board"


def test_create_board_starts_empty_with_fixed_columns(client: TestClient) -> None:
    response = client.post("/api/boards", json={"name": "  Roadmap  "})

    assert response.status_code == 201
    payload = response.json()
    assert payload["name"] == "Roadmap"
    assert payload["version"] == 1
    assert payload["board"]["cards"] == {}
    assert [c["id"] for c in payload["board"]["columns"]] == [
        "col-backlog",
        "col-discovery",
        "col-progress",
        "col-review",
        "col-done",
    ]
    assert len(client.get("/api/boards").json()) == 2


@pytest.mark.parametrize("name", ["", "x" * 81])
def test_create_board_validates_name(client: TestClient, name: str) -> None:
    assert client.post("/api/boards", json={"name": name}).status_code == 422


def test_boards_are_independent(client: TestClient) -> None:
    second = client.post("/api/boards", json={"name": "Second"}).json()
    first_id = client.get("/api/boards").json()[0]["id"]

    board = second["board"]
    board["cards"]["c1"] = {"id": "c1", "title": "Only here", "details": ""}
    board["columns"][0]["cardIds"].append("c1")
    put = client.put(
        f"/api/boards/{second['id']}",
        json={"board": board, "expected_version": second["version"]},
    )

    assert put.status_code == 200
    assert put.json()["version"] == 2
    assert "c1" not in client.get(f"/api/boards/{first_id}").json()["board"]["cards"]
    assert "c1" in client.get(f"/api/boards/{second['id']}").json()["board"]["cards"]


def test_put_board_by_id_rejects_stale_version(client: TestClient) -> None:
    created = client.post("/api/boards", json={"name": "Versioned"}).json()

    response = client.put(
        f"/api/boards/{created['id']}",
        json={"board": created["board"], "expected_version": 99},
    )

    assert response.status_code == 409


def test_put_board_by_id_rejects_column_changes(client: TestClient) -> None:
    created = client.post("/api/boards", json={"name": "Fixed"}).json()
    created["board"]["columns"].pop()

    response = client.put(
        f"/api/boards/{created['id']}",
        json={"board": created["board"], "expected_version": 1},
    )

    assert response.status_code == 422


def test_unknown_board_is_404(client: TestClient) -> None:
    assert client.get("/api/boards/9999").status_code == 404
    board = client.get("/api/board").json()["board"]
    put = client.put("/api/boards/9999", json={"board": board, "expected_version": 1})
    assert put.status_code == 404


def test_rename_board(client: TestClient) -> None:
    board_id = client.get("/api/boards").json()[0]["id"]

    response = client.patch(f"/api/boards/{board_id}", json={"name": "Renamed"})

    assert response.status_code == 200
    assert response.json()["name"] == "Renamed"
    assert client.get(f"/api/boards/{board_id}").json()["name"] == "Renamed"
    assert client.patch(f"/api/boards/{board_id}", json={"name": ""}).status_code == 422
    assert client.patch("/api/boards/9999", json={"name": "x"}).status_code == 404


def test_delete_board_but_not_the_last_one(client: TestClient) -> None:
    first_id = client.get("/api/boards").json()[0]["id"]
    second_id = client.post("/api/boards", json={"name": "Extra"}).json()["id"]

    assert client.delete(f"/api/boards/{second_id}").status_code == 200
    assert client.get(f"/api/boards/{second_id}").status_code == 404
    assert client.delete(f"/api/boards/{first_id}").status_code == 409
    assert len(client.get("/api/boards").json()) == 1


def test_legacy_board_endpoint_targets_oldest_board(client: TestClient) -> None:
    first = client.get("/api/boards").json()[0]
    client.post("/api/boards", json={"name": "Newer"})

    assert client.get("/api/board").json()["id"] == first["id"]


def test_ai_chat_by_board_id_updates_only_that_board(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    created = client.post("/api/boards", json={"name": "AI board"}).json()
    first_id = client.get("/api/boards").json()[0]["id"]
    seen: dict[str, object] = {}

    def fake_assistant(board, user_message, conversation_history):
        seen["cards"] = dict(board["cards"])
        updated = {
            "columns": [dict(c) for c in board["columns"]],
            "cards": {"n1": {"id": "n1", "title": "From AI", "details": ""}},
        }
        updated["columns"][0]["cardIds"] = ["n1"]
        return {"model": "fake", "assistant_message": "Added", "board_update": updated}

    monkeypatch.setattr(main.ai, "run_kanban_assistant", fake_assistant)

    response = client.post(
        f"/api/boards/{created['id']}/ai/chat",
        json={"user_message": "add a card", "conversation_history": []},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["board_updated"] is True
    assert body["id"] == created["id"]
    assert seen["cards"] == {}
    assert "n1" in client.get(f"/api/boards/{created['id']}").json()["board"]["cards"]
    assert "n1" not in client.get(f"/api/boards/{first_id}").json()["board"]["cards"]


def test_ai_chat_unknown_board_is_404(client: TestClient) -> None:
    response = client.post(
        "/api/boards/9999/ai/chat",
        json={"user_message": "hi", "conversation_history": []},
    )
    assert response.status_code == 404
