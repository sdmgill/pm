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


def test_ai_chat_requires_auth(client: TestClient) -> None:
    response = client.post(
        "/api/ai/chat",
        json={"user_message": "Summarize", "conversation_history": []},
    )
    assert response.status_code == 401


def test_ai_chat_returns_message_without_board_update(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    login(client)

    def fake_run(**_: object) -> dict[str, object]:
        return {
            "model": "test-model",
            "assistant_message": "No update needed.",
            "board_update": None,
        }

    monkeypatch.setattr(main.ai, "run_kanban_assistant", fake_run)

    before = client.get("/api/board").json()
    response = client.post(
        "/api/ai/chat",
        json={"user_message": "Anything to change?", "conversation_history": []},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["assistant_message"] == "No update needed."
    assert payload["board_updated"] is False
    assert payload["version"] == before["version"]


def test_ai_chat_persists_board_update(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    login(client)

    current = client.get("/api/board").json()
    updated_board = current["board"]
    updated_board["columns"][0]["title"] = "AI Updated Backlog"

    def fake_run(**_: object) -> dict[str, object]:
        return {
            "model": "test-model",
            "assistant_message": "Updated the backlog title.",
            "board_update": updated_board,
        }

    monkeypatch.setattr(main.ai, "run_kanban_assistant", fake_run)

    response = client.post(
        "/api/ai/chat",
        json={
            "user_message": "Rename backlog",
            "conversation_history": [{"role": "user", "content": "Please rename backlog."}],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["board_updated"] is True
    assert payload["assistant_message"] == "Updated the backlog title."
    assert payload["board"]["columns"][0]["title"] == "AI Updated Backlog"
    assert payload["version"] == current["version"] + 1

    board_after = client.get("/api/board").json()
    assert board_after["board"]["columns"][0]["title"] == "AI Updated Backlog"


def test_ai_chat_rejects_invalid_structured_output(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    login(client)

    def fake_run(**_: object) -> dict[str, object]:
        return {"model": "test-model", "board_update": None}

    monkeypatch.setattr(main.ai, "run_kanban_assistant", fake_run)

    response = client.post(
        "/api/ai/chat",
        json={"user_message": "Hello", "conversation_history": []},
    )

    assert response.status_code == 502
    assert "Invalid AI structured output" in response.json()["detail"]


def test_ai_chat_rejects_dangling_card_id(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    login(client)

    current = client.get("/api/board").json()
    board = current["board"]
    board["columns"][0]["cardIds"].append("card-missing")

    def fake_run(**_: object) -> dict[str, object]:
        return {"model": "test-model", "assistant_message": "Done.", "board_update": board}

    monkeypatch.setattr(main.ai, "run_kanban_assistant", fake_run)

    response = client.post(
        "/api/ai/chat",
        json={"user_message": "Add a card", "conversation_history": []},
    )

    assert response.status_code == 502
    assert client.get("/api/board").json()["version"] == current["version"]


def test_ai_chat_rejects_column_removal(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    login(client)

    current = client.get("/api/board").json()
    board = current["board"]
    removed = board["columns"].pop()
    for card_id in removed["cardIds"]:
        del board["cards"][card_id]

    def fake_run(**_: object) -> dict[str, object]:
        return {"model": "test-model", "assistant_message": "Done.", "board_update": board}

    monkeypatch.setattr(main.ai, "run_kanban_assistant", fake_run)

    response = client.post(
        "/api/ai/chat",
        json={"user_message": "Remove Done", "conversation_history": []},
    )

    assert response.status_code == 502
    assert "Columns are fixed" in response.json()["detail"]
    assert client.get("/api/board").json()["version"] == current["version"]
