import os
from pathlib import Path
from types import SimpleNamespace

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


def test_ai_connectivity_requires_auth(client: TestClient) -> None:
    response = client.get("/api/ai/connectivity")
    assert response.status_code == 401


def test_ai_connectivity_returns_answer(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    login(client)

    class FakeResponses:
        @staticmethod
        def create(**_: object) -> object:
            return SimpleNamespace(output_text="4")

    fake_client = SimpleNamespace(responses=FakeResponses())

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("AI_MODEL", "test-model")
    monkeypatch.setattr(main.ai, "get_openai_client", lambda: fake_client)

    response = client.get("/api/ai/connectivity")
    assert response.status_code == 200

    payload = response.json()
    assert payload["model"] == "test-model"
    assert payload["prompt"] == "2+2"
    assert payload["answer"] == "4"


def test_ai_connectivity_missing_key_returns_503(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    login(client)

    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("AI_MODEL", "test-model")

    response = client.get("/api/ai/connectivity")
    assert response.status_code == 503
    assert "OPENAI_API_KEY" in response.json()["detail"]


@pytest.mark.skipif(
    os.getenv("RUN_OPENAI_SMOKE") != "1",
    reason="Set RUN_OPENAI_SMOKE=1 to run real OpenAI connectivity check",
)
def test_ai_connectivity_smoke_real_call(client: TestClient) -> None:
    login(client)

    response = client.get("/api/ai/connectivity")
    assert response.status_code == 200
    payload = response.json()
    assert payload["prompt"] == "2+2"
    assert isinstance(payload["answer"], str)
    assert len(payload["answer"]) > 0
