# Backend Guide

## Overview

Python FastAPI app managed with `uv`. It serves the API and the static NextJS build (copied to `app/static` in the Docker image) at `/`.

## Key files

- `app/main.py`: routes, Pydantic request/response models, cookie session auth, startup DB initialization.
- `app/db.py`: SQLite schema, default board data, board snapshot read/write with optimistic versioning.
- `app/ai.py`: OpenAI client, connectivity check, Kanban assistant structured-output call.

## Routes

- `GET /health`: health check.
- `GET /auth/me`, `POST /auth/login`, `POST /auth/logout`: fake auth with fixed `user` / `password`, HMAC-signed httpOnly `pm_session` cookie.
- `GET /api/board`, `PUT /api/board`: read/replace the user's board. `PUT` requires `expected_version`; a mismatch returns 409. An inconsistent board or a change to the column ids returns 422.
- `GET /api/ai/connectivity`: simple "2+2" AI call.
- `POST /api/ai/chat`: sends board + chat history + user message to the AI. Uses a strict JSON-schema structured output `{assistant_message, board_update}` (cards as an array in the AI contract, converted back to the stored map). `board_update` is validated against `BoardModel` and the fixed column ids, and saved only when valid. Invalid output returns 502 and does not change the board.

All `/api/*` routes require an authenticated session.

## Configuration

- `OPENAI_API_KEY`: required for AI routes (503 if missing).
- `AI_MODEL`: defaults to `gpt-5.3-codex`.
- `DB_PATH`: defaults to `/data/pm.db` (Docker volume). See `docs/DATABASE.md`.
- `SESSION_SECRET`: cookie signing secret. Required; startup fails if unset. Sessions expire after 7 days.

## Tests

- `uv run pytest` from `backend/`. `tests/conftest.py` sets a test `SESSION_SECRET`.
- Dependencies are locked in `uv.lock`; the Docker build uses `uv sync --frozen`. Run `uv lock` after changing `pyproject.toml`.
- Tests use FastAPI `TestClient`, monkeypatch `main.DB_PATH` to a temp file, and mock AI calls.
- Real OpenAI smoke test runs only with `RUN_OPENAI_SMOKE=1`.
- `pytest` is a runtime dependency, so tests can also run inside the container: `docker compose exec app python -m pytest`.
