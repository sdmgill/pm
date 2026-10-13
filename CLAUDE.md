# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Business requirements, technical decisions, color scheme and coding standards live in `AGENTS.md` (imported below). Per-area guides are in `frontend/AGENTS.md`, `backend/AGENTS.md` and `scripts/AGENTS.md`. The phased build plan and checklist is `docs/PLAN.md`; the SQLite schema is documented in `docs/DATABASE.md`. Read PLAN.md before starting new work.

@AGENTS.md

## Commands

Run the full app (Docker, serves on http://localhost:8000; requires `.env` copied from `.env.example`):

- Start: `scripts/start.ps1` (Windows), `scripts/start.sh` (Mac/Linux) -- wraps `docker compose up --build -d`
- Stop: `scripts/stop.ps1` / `scripts/stop.sh`

Backend (from `backend/`, uses `uv`):

- All tests: `uv run pytest`
- Single test: `uv run pytest tests/test_board_api.py::test_get_board_requires_auth`
- Real OpenAI smoke test (needs `OPENAI_API_KEY`): set `RUN_OPENAI_SMOKE=1` then run `uv run pytest tests/test_ai_connectivity.py`
- Dev server: `uv run uvicorn app.main:app --reload` (set `DB_PATH` to a local file; the default `/data/pm.db` is the container volume path)

Frontend (from `frontend/`):

- `npm run lint`, `npm run build`
- Unit tests (Vitest, jsdom): `npm run test:unit`; single file: `npx vitest run src/lib/kanban.test.ts`
- E2E (Playwright): `npm run test:e2e`; single test: `npx playwright test -g "<test name>"`

## Architecture

Single container: the Next.js app is built as a static export (`output: "export"` in `next.config.ts`) and the Dockerfile copies `frontend/out` into `backend/app/static`, which FastAPI serves at `/`. There is no Next.js server at runtime, so the frontend can only use client-side code and calls the backend with same-origin relative URLs (`/auth/*`, `/api/*`).

Backend (`backend/app/`):

- `main.py` -- all routes, Pydantic request/response models, and auth. Auth is a fake fixed login (`user`/`password`) issuing an HMAC-signed httpOnly `pm_session` cookie (`SESSION_SECRET`); board/AI routes depend on `_require_authenticated_user`. On startup it initializes the DB and ensures the demo user and its board exist.
- `db.py` -- raw `sqlite3`. Each user has exactly one board stored as a JSON snapshot with an integer `version`; `save_board_snapshot` does optimistic concurrency via `expected_version` (mismatch raises `ValueError`, mapped to HTTP 409).
- `ai.py` -- OpenAI Responses API client (`OPENAI_API_KEY`, `AI_MODEL`). `run_kanban_assistant` sends the current board JSON, chat history and user message, and expects JSON `{assistant_message, board_update}` where `board_update` is a full replacement board or null. `/api/ai/chat` validates this against the same Pydantic board models before saving; invalid AI output must never mutate the board.

Frontend (`frontend/src/`):

- `lib/kanban.ts` -- the `BoardData` shape (`columns[]` with ordered `cardIds`, plus a `cards` map by id) and move logic. This shape must stay in sync with `BoardModel` in `backend/app/main.py` and with what the AI is told to return.
- `components/AuthenticatedHome.tsx` -- owns auth state, board loading/saving (tracking `version` for PUTs) and AI chat calls; all `fetch` calls live here. `KanbanBoard` and `AIChatSidebar` are presentational children.
- `NEXT_PUBLIC_USE_LOCAL_DEMO_AUTH=1` (set by `playwright.config.ts`) makes the frontend fall back to local demo auth/data so e2e tests run against `next dev` without the backend.

Backend tests use FastAPI `TestClient` and isolate the DB by monkeypatching `main.DB_PATH` to a `tmp_path` file; AI calls are mocked by default.
