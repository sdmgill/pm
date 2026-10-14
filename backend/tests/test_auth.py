import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import main
from app.main import app


@pytest.fixture()
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(main, "DB_PATH", tmp_path / "pm-auth.db")
    with TestClient(app) as test_client:
        yield test_client


def test_health_endpoint(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_auth_me_unauthenticated(client: TestClient) -> None:
    response = client.get("/auth/me")
    assert response.status_code == 200
    assert response.json() == {"authenticated": False, "user": None}


def test_auth_login_rejects_invalid_credentials(client: TestClient) -> None:
    response = client.post(
        "/auth/login",
        json={"username": "user", "password": "wrong"},
    )
    assert response.status_code == 401


def test_auth_login_sets_cookie_and_me_authenticated(client: TestClient) -> None:
    login_response = client.post(
        "/auth/login",
        json={"username": "user", "password": "password"},
    )

    assert login_response.status_code == 200
    assert login_response.json() == {"authenticated": True, "user": "user"}
    assert "pm_session=" in login_response.headers.get("set-cookie", "")

    me_response = client.get("/auth/me")
    assert me_response.status_code == 200
    assert me_response.json() == {"authenticated": True, "user": "user"}


def test_auth_logout_clears_cookie(client: TestClient) -> None:
    client.post(
        "/auth/login",
        json={"username": "user", "password": "password"},
    )

    logout_response = client.post("/auth/logout")
    assert logout_response.status_code == 200
    assert logout_response.json() == {"authenticated": False}

    me_response = client.get("/auth/me")
    assert me_response.status_code == 200
    assert me_response.json() == {"authenticated": False, "user": None}


def test_auth_rejects_expired_session_cookie(client: TestClient) -> None:
    payload = f"user.{int(time.time()) - main.SESSION_MAX_AGE_SECONDS - 60}"
    expired_cookie = f"{payload}.{main._sign_value(payload)}"

    response = TestClient(main.app, cookies={"pm_session": expired_cookie}).get("/auth/me")

    assert response.json() == {"authenticated": False, "user": None}


def test_auth_rejects_tampered_session_cookie(client: TestClient) -> None:
    payload = f"user.{int(time.time())}"
    tampered_cookie = f"{payload}.bad-signature"
    response = TestClient(app, cookies={"pm_session": tampered_cookie}).get("/auth/me")

    assert response.json() == {"authenticated": False, "user": None}


def test_register_creates_user_with_own_board_and_session(client: TestClient) -> None:
    response = client.post("/auth/register", json={"username": "alice", "password": "secret1"})

    assert response.status_code == 201
    assert response.json() == {"authenticated": True, "user": "alice"}
    assert client.get("/auth/me").json() == {"authenticated": True, "user": "alice"}
    assert len(client.get("/api/boards").json()) == 1


def test_register_rejects_duplicate_username(client: TestClient) -> None:
    first = client.post("/auth/register", json={"username": "bob", "password": "secret1"})
    second = client.post("/auth/register", json={"username": "bob", "password": "other-pass"})

    assert first.status_code == 201
    assert second.status_code == 409


@pytest.mark.parametrize(
    "payload",
    [
        {"username": "ab", "password": "secret1"},
        {"username": "has space", "password": "secret1"},
        {"username": "dot.name", "password": "secret1"},
        {"username": "carol", "password": "short"},
    ],
)
def test_register_validates_input(client: TestClient, payload: dict[str, str]) -> None:
    assert client.post("/auth/register", json=payload).status_code == 422


def test_registered_user_can_log_in_again(client: TestClient) -> None:
    client.post("/auth/register", json={"username": "dave", "password": "secret1"})
    client.post("/auth/logout")

    wrong = client.post("/auth/login", json={"username": "dave", "password": "nope"})
    right = client.post("/auth/login", json={"username": "dave", "password": "secret1"})

    assert wrong.status_code == 401
    assert right.status_code == 200


def test_users_cannot_see_each_others_boards(client: TestClient) -> None:
    client.post("/auth/register", json={"username": "erin", "password": "secret1"})
    erin_board_id = client.get("/api/boards").json()[0]["id"]
    client.post("/auth/logout")

    client.post("/auth/register", json={"username": "frank", "password": "secret1"})

    assert client.get(f"/api/boards/{erin_board_id}").status_code == 404
    assert client.delete(f"/api/boards/{erin_board_id}").status_code == 404
    assert client.patch(f"/api/boards/{erin_board_id}", json={"name": "x"}).status_code == 404


def test_change_password(client: TestClient) -> None:
    client.post("/auth/register", json={"username": "gina", "password": "secret1"})

    bad = client.post(
        "/auth/change-password",
        json={"current_password": "wrong!", "new_password": "newsecret"},
    )
    good = client.post(
        "/auth/change-password",
        json={"current_password": "secret1", "new_password": "newsecret"},
    )
    client.post("/auth/logout")

    assert bad.status_code == 403
    assert good.status_code == 200
    old_login = client.post("/auth/login", json={"username": "gina", "password": "secret1"})
    new_login = client.post("/auth/login", json={"username": "gina", "password": "newsecret"})
    assert old_login.status_code == 401
    assert new_login.status_code == 200


def test_change_password_requires_auth(client: TestClient) -> None:
    response = client.post(
        "/auth/change-password",
        json={"current_password": "a", "new_password": "newsecret"},
    )
    assert response.status_code == 401


def test_delete_account_removes_user_and_boards(client: TestClient) -> None:
    client.post("/auth/register", json={"username": "hank", "password": "secret1"})

    wrong = client.request("DELETE", "/auth/account", json={"password": "bad"})
    deleted = client.request("DELETE", "/auth/account", json={"password": "secret1"})

    assert wrong.status_code == 403
    assert deleted.status_code == 200
    assert client.get("/auth/me").json() == {"authenticated": False, "user": None}
    login = client.post("/auth/login", json={"username": "hank", "password": "secret1"})
    assert login.status_code == 401


def test_session_for_unknown_user_is_rejected(client: TestClient) -> None:
    payload = f"ghost.{int(time.time())}"
    cookie = f"{payload}.{main._sign_value(payload)}"

    response = TestClient(main.app, cookies={"pm_session": cookie}).get("/auth/me")

    assert response.json() == {"authenticated": False, "user": None}


def test_startup_requires_session_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(main, "SESSION_SECRET", "")

    with pytest.raises(RuntimeError, match="SESSION_SECRET"):
        main.startup()
