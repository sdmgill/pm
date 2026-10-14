import time

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_endpoint() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_auth_me_unauthenticated() -> None:
    response = client.get("/auth/me")
    assert response.status_code == 200
    assert response.json() == {"authenticated": False, "user": None}


def test_auth_login_rejects_invalid_credentials() -> None:
    response = client.post(
        "/auth/login",
        json={"username": "user", "password": "wrong"},
    )
    assert response.status_code == 401


def test_auth_login_sets_cookie_and_me_authenticated() -> None:
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


def test_auth_logout_clears_cookie() -> None:
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


def test_auth_rejects_expired_session_cookie() -> None:
    from app import main

    payload = f"user.{int(time.time()) - main.SESSION_MAX_AGE_SECONDS - 60}"
    expired_cookie = f"{payload}.{main._sign_value(payload)}"

    response = TestClient(main.app, cookies={"pm_session": expired_cookie}).get("/auth/me")

    assert response.json() == {"authenticated": False, "user": None}


def test_auth_rejects_tampered_session_cookie() -> None:
    payload = f"user.{int(time.time())}"
    tampered_cookie = f"{payload}.bad-signature"
    response = TestClient(app, cookies={"pm_session": tampered_cookie}).get("/auth/me")

    assert response.json() == {"authenticated": False, "user": None}


def test_startup_requires_session_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    from app import main

    monkeypatch.setattr(main, "SESSION_SECRET", "")

    with pytest.raises(RuntimeError, match="SESSION_SECRET"):
        main.startup()
